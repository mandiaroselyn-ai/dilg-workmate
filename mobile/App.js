import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, NativeModules, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { WebView } from 'react-native-webview';

WebBrowser.maybeCompleteAuthSession();

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const toBase64Url = bytes => {
	let output = '';
	for (let index = 0; index < bytes.length; index += 3) {
		const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
		const charCount = Math.min(4, Math.ceil(((bytes.length - index) * 8) / 6));
		for (let position = 0; position < charCount; position += 1) {
			output += BASE64URL_ALPHABET[(chunk >> (18 - position * 6)) & 63];
		}
	}
	return output;
};

const configuredWebAppUrl = process.env.EXPO_PUBLIC_WEB_URL || (
	Platform.OS === 'android' ? 'http://10.0.2.2:5173' : 'http://localhost:5173'
);
const MOBILE_REDIRECT_URI = 'com.dilg.workmate.employee://oauth';
const WEB_APP_URL = `${configuredWebAppUrl}${configuredWebAppUrl.includes('?') ? '&' : '?'}platform=mobile&role=employee`;

export default function App() {
	const webViewRef = useRef(null);
	const [canGoBack, setCanGoBack] = useState(false);
	const [loading, setLoading] = useState(true);
	const [hasError, setHasError] = useState(false);

	useEffect(() => {
		if (Platform.OS !== 'android') return undefined;

		const handleBackPress = () => {
			if (!canGoBack) return false;
			webViewRef.current?.goBack();
			return true;
		};

		const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
		return () => subscription.remove();
	}, [canGoBack]);

	const handleWebViewMessage = async (event) => {
		let message;
		try {
			message = JSON.parse(event.nativeEvent.data);
		} catch {
			return;
		}

		if (message?.type === 'dilg-camera-auth') {
			let payload;
			try {
				const permission = await ImagePicker.requestCameraPermissionsAsync();
				if (!permission.granted) throw new Error('Close floating bubbles or overlays, then allow WorkMate camera access in the Android prompt. If no prompt appears, enable Camera in WorkMate app settings.');
				const result = await ImagePicker.launchCameraAsync({
					mediaTypes: ['images'],
					cameraType: ImagePicker.CameraType.front,
					allowsEditing: false,
					quality: 0.8,
					base64: true
				});
				const asset = result.canceled ? null : result.assets?.[0];
				payload = asset?.base64
					? { success: true, base64: `data:image/jpeg;base64,${asset.base64}` }
					: { success: false, error: 'Camera capture was cancelled.' };
			} catch (error) {
				payload = { success: false, error: error.message || 'Camera permission or capture failed.' };
			}
			webViewRef.current?.injectJavaScript(
				`window.dispatchEvent(new CustomEvent('dilg-camera-result',{detail:${JSON.stringify(payload)}})); true;`
			);
			return;
		}
		if (message?.type === 'dilg-google-auth') {
			try {
				// PKCE: the backend only returns a short-lived code in the redirect, and only this
				// app instance knows the verifier needed to exchange it for a session token.
				const codeVerifier = toBase64Url(Crypto.getRandomBytes(32));
				const codeChallenge = toBase64Url(new Uint8Array(await Crypto.digest(
					Crypto.CryptoDigestAlgorithm.SHA256,
					new TextEncoder().encode(codeVerifier)
				)));
				const authUrl = `${configuredWebAppUrl}/api/auth/google/url?mobile=1&code_challenge=${codeChallenge}`;
				const result = await WebBrowser.openAuthSessionAsync(authUrl, MOBILE_REDIRECT_URI);
				if (result.type === 'success' && result.url) {
					const callbackUrl = new URL(result.url);
					const code = callbackUrl.searchParams.get('code');
					const error = callbackUrl.searchParams.get('error');
					let payload;
					if (error || !code) {
						payload = { type: 'google-login-failure', error: error || 'Google sign-in failed.' };
					} else {
						const response = await fetch(`${configuredWebAppUrl}/api/auth/google/exchange`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ code, codeVerifier })
						});
						const data = await response.json().catch(() => ({}));
						payload = response.ok && data.token
							? { type: 'google-login-success', user: data.user || null, token: data.token }
							: { type: 'google-login-failure', error: data.error || 'Google sign-in failed.' };
					}
					webViewRef.current?.injectJavaScript(
						`window.postMessage(${JSON.stringify(payload)}, '*'); true;`
					);
				}
			} catch (error) {
				webViewRef.current?.injectJavaScript(
					`window.postMessage(${JSON.stringify({ type: 'google-login-failure', error: error.message })}, '*'); true;`
				);
			}
			return;
		}
		if (message?.type === 'dilg-location-auth') {
			try {
				const permission = await Location.requestForegroundPermissionsAsync();
				if (permission.status !== 'granted') throw new Error('Close floating bubbles or overlays, then allow WorkMate location access in the Android prompt. If no prompt appears, enable Location in WorkMate app settings.');
				const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
				const payload = {
					success: true,
					requestId: message.requestId,
					coords: {
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
						accuracy: position.coords.accuracy || 0
					}
				};
				webViewRef.current?.injectJavaScript(
					`window.dispatchEvent(new CustomEvent('dilg-location-result',{detail:${JSON.stringify(payload)}})); true;`
				);
			} catch (error) {
				webViewRef.current?.injectJavaScript(
					`window.dispatchEvent(new CustomEvent('dilg-location-result',{detail:${JSON.stringify({ success: false, requestId: message.requestId, error: error.message })}})); true;`
				);
			}
			return;
		}
		if (message?.type !== 'dilg-native-biometric-auth') return;

		try {
			if (typeof message.challenge !== 'string' || typeof message.keyId !== 'string' || !message.requestId) {
				throw new Error('Invalid fingerprint verification request.');
			}
			if (!NativeModules.NativeBiometric?.signChallenge) {
				throw new Error('Update and reinstall the WorkMate app to enable secure fingerprint verification.');
			}
			const assertion = await NativeModules.NativeBiometric.signChallenge(message.challenge, message.keyId);
			const payload = {
				success: true,
				requestId: message.requestId,
				signature: assertion.signature,
				publicKey: assertion.publicKey
			};
			webViewRef.current?.injectJavaScript(
				`window.dispatchEvent(new CustomEvent('dilg-biometric-result',{detail:${JSON.stringify(payload)}})); true;`
			);
		} catch (error) {
			const payload = {
				success: false,
				requestId: message.requestId,
				error: error?.message || 'Phone fingerprint verification failed.'
			};
			webViewRef.current?.injectJavaScript(
				`window.dispatchEvent(new CustomEvent('dilg-biometric-result',{detail:${JSON.stringify(payload)}})); true;`
			);
		}
	};

	if (hasError) {
		return (
			<SafeAreaProvider>
			<SafeAreaView style={styles.container}>
				<StatusBar style="dark" />
				<View style={styles.message}>
					<Text style={styles.title}>Unable to load DILG WorkMate</Text>
					<Text style={styles.body}>Check your connection, then restart the app.</Text>
				</View>
			</SafeAreaView>
			</SafeAreaProvider>
		);
	}

	return (
		<SafeAreaProvider>
		<SafeAreaView style={styles.container}>
			<StatusBar style="dark" />
			<WebView
				ref={webViewRef}
				source={{ uri: WEB_APP_URL }}
				style={styles.webView}
				originWhitelist={['http://*', 'https://*']}
				javaScriptEnabled
				geolocationEnabled
				injectedJavaScriptBeforeContentLoaded={`window.dilgNativeBiometricSupported = ${Platform.OS === 'android'};
				(function(){
					var callbacks = {};
					var nextId = 0;
					window.addEventListener('dilg-location-result', function(event){
						var data = event.detail || {};
						var callback = callbacks[data.requestId];
						if (!callback) return;
						delete callbacks[data.requestId];
						if (data.success) callback.success({coords:{latitude:data.coords.latitude,longitude:data.coords.longitude,accuracy:data.coords.accuracy}});
						else if (callback.error) callback.error({code:1,message:data.error || 'Location permission denied.'});
					});
					navigator.geolocation = {
						getCurrentPosition: function(success,error){
							var requestId = String(++nextId);
							callbacks[requestId] = {success:success,error:error};
							window.ReactNativeWebView.postMessage(JSON.stringify({type:'dilg-location-auth',requestId:requestId}));
						}
					};
				})(); true;`}
				domStorageEnabled
				sharedCookiesEnabled
				thirdPartyCookiesEnabled
				allowsInlineMediaPlayback
				mediaPlaybackRequiresUserAction={false}
				mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
				startInLoadingState
				pullToRefreshEnabled
				onLoadStart={() => {
					setLoading(true);
					setHasError(false);
				}}
				onLoadEnd={() => setLoading(false)}
				onError={() => {
					setLoading(false);
					setHasError(true);
				}}
				onMessage={handleWebViewMessage}
				onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
			/>
			{loading && (
				<View style={styles.loader}>
					<ActivityIndicator size="large" color="#176b87" />
				</View>
			)}
		</SafeAreaView>
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f7fafb',
	},
	webView: {
		flex: 1,
		backgroundColor: '#f7fafb',
	},
	loader: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#f7fafb',
	},
	message: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 24,
	},
	title: {
		color: '#17313b',
		fontSize: 20,
		fontWeight: '700',
		textAlign: 'center',
	},
	body: {
		color: '#55717b',
		fontSize: 15,
		marginTop: 8,
		textAlign: 'center',
	},
});
