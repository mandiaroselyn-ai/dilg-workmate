import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Camera from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';

const configuredWebAppUrl = process.env.EXPO_PUBLIC_WEB_URL || (
	Platform.OS === 'android' ? 'http://10.0.2.2:5173' : 'http://localhost:5173'
);
const WEB_APP_URL = `${configuredWebAppUrl}${configuredWebAppUrl.includes('?') ? '&' : '?'}platform=mobile&role=employee`;

export default function App() {
	const webViewRef = useRef(null);
	const [canGoBack, setCanGoBack] = useState(false);
	const [loading, setLoading] = useState(true);
	const [hasError, setHasError] = useState(false);

	useEffect(() => {
		const requestPermission = (permissionRequest) => {
			if (typeof permissionRequest !== 'function') return;
			Promise.resolve(permissionRequest()).catch(() => {});
		};

		requestPermission(Camera.requestCameraPermissionsAsync);
		requestPermission(Location.requestForegroundPermissionsAsync);

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
			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: ['images'],
				cameraType: ImagePicker.CameraType.front,
				allowsEditing: false,
				quality: 0.8,
				base64: true
			});
			const asset = result.canceled ? null : result.assets?.[0];
			const payload = asset?.base64
				? { success: true, base64: `data:image/jpeg;base64,${asset.base64}` }
				: { success: false };
			webViewRef.current?.injectJavaScript(
				`window.dispatchEvent(new CustomEvent('dilg-camera-result',{detail:${JSON.stringify(payload)}})); true;`
			);
			return;
		}
		if (message?.type === 'dilg-location-auth') {
			try {
				const permission = await Location.requestForegroundPermissionsAsync();
				if (permission.status !== 'granted') throw new Error('Location permission denied.');
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
		if (message?.type !== 'dilg-biometric-auth') return;

		const result = await LocalAuthentication.authenticateAsync({
			promptMessage: 'Verify your identity to clock in',
			cancelLabel: 'Cancel',
			disableDeviceFallback: false
		});
		const success = Boolean(result.success);
		webViewRef.current?.injectJavaScript(
			`window.dispatchEvent(new CustomEvent('dilg-biometric-result',{detail:{success:${success}}})); true;`
		);
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
				injectedJavaScriptBeforeContentLoaded={`(function(){
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
