import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, NativeModules, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { WebView } from 'react-native-webview';

// The splash stays up until the web app loads, so the app opens on a single launch screen.
SplashScreen.preventAutoHideAsync().catch(() => {});
const SPLASH_MAX_MS = 20000;
const SIGN_IN_COVER_MAX_MS = 10000;
// After a Google account is chosen, a spinner drawn inside the page hides the login form
// until the dashboard shows. It goes up while Google is open, so it is never seen before.
const SHOW_SIGN_IN_COVER_JS = `(function(){
	if (document.getElementById('dilg-signin-cover')) return;
	var cover = document.createElement('div');
	cover.id = 'dilg-signin-cover';
	cover.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#fff;display:flex;align-items:center;justify-content:center';
	cover.innerHTML = '<style>@keyframes dilgspin{to{transform:rotate(360deg)}}</style><div style="width:44px;height:44px;border:4px solid #dbeafe;border-top-color:#1e40af;border-radius:50%;animation:dilgspin .8s linear infinite"></div>';
	document.body.appendChild(cover);
})(); true;`;
const HIDE_SIGN_IN_COVER_JS = `(function(){
	var cover = document.getElementById('dilg-signin-cover');
	if (cover) cover.remove();
})(); true;`;
// Removes the cover once the dashboard shows: no login form and no "Signing you in" screen.
const WATCH_FOR_DASHBOARD_JS = `(function(){
	var done = false;
	function onDashboard(){
		return !document.querySelector('input[type=password]') && !/Signing you in/.test(document.body.innerText || '');
	}
	var timer = setInterval(function(){ if (onDashboard()) report(); }, 200);
	function report(){
		if (done) return;
		done = true;
		clearInterval(timer);
		var cover = document.getElementById('dilg-signin-cover');
		if (cover) cover.remove();
		window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dilg-signed-in' }));
	}
	setTimeout(report, ${SIGN_IN_COVER_MAX_MS});
})(); true;`;

// Registers this phone's push token for whoever is signed in to the page, using the page's
// saved session, so it works however the person signed in (password, Google, or a saved session).
const registerPushTokenJs = token => `(function(){
	window.__expoPushToken = ${JSON.stringify(token)};
	var session = '';
	try { session = sessionStorage.getItem('dilg_auth_token') || localStorage.getItem('dilg_auth_token') || ''; } catch (e) {}
	if (!session) return;
	fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
		body: JSON.stringify({ type: 'expo', expoToken: window.__expoPushToken })
	}).catch(function(){});
})(); true;`;

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowAlert: true,
		shouldPlaySound: true,
		shouldSetBadge: true
	})
});

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
const WEB_APP_ORIGIN = new URL(configuredWebAppUrl).origin;

// Only the WorkMate web app may load in the WebView or use the native bridge (fingerprint
// signing, GPS, camera, Google sign-in). Other links, such as Google Maps, open in the browser.
const isWorkMateUrl = url => {
	try {
		return new URL(url).origin === WEB_APP_ORIGIN;
	} catch {
		return false;
	}
};

const handleNavigationRequest = request => {
	if (request.isTopFrame === false || isWorkMateUrl(request.url) || /^(about|blob|data):/.test(request.url)) return true;
	Linking.openURL(request.url).catch(() => {});
	return false;
};

export default function App() {
	const webViewRef = useRef(null);
	const [canGoBack, setCanGoBack] = useState(false);
	const [loading, setLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [splashVisible, setSplashVisible] = useState(true);
	const [signingIn, setSigningIn] = useState(false);
	const signingInRef = useRef(false);
	const googleOpenRef = useRef(false);
	const finishingSignInRef = useRef(false);
	const expoPushTokenRef = useRef('');
	const pageReadyRef = useRef(false);
	const notificationToOpenRef = useRef(null);
	const openedNotificationIdsRef = useRef(new Set());

	// Hands a tapped notification to the page, which opens its page once someone is signed in.
	// It waits for the page when the tap opened the app.
	const deliverNotificationToOpen = () => {
		const target = notificationToOpenRef.current;
		if (!target || !pageReadyRef.current) return;
		notificationToOpenRef.current = null;
		webViewRef.current?.injectJavaScript(
			`window.__dilgOpenNotification = ${JSON.stringify(target)}; window.dispatchEvent(new Event('dilg-open-notification')); true;`
		);
	};

	useEffect(() => {
		const openNotification = response => {
			const id = response?.notification?.request?.identifier;
			const target = response?.notification?.request?.content?.data;
			if (!id || openedNotificationIdsRef.current.has(id) || !target || typeof target !== 'object') return;
			openedNotificationIdsRef.current.add(id);
			notificationToOpenRef.current = target;
			deliverNotificationToOpen();
		};
		Notifications.getLastNotificationResponseAsync().then(openNotification).catch(() => {});
		const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
		return () => subscription.remove();
	}, []);

	const coverSignIn = () => {
		signingInRef.current = true;
		setSigningIn(true);
		webViewRef.current?.injectJavaScript(SHOW_SIGN_IN_COVER_JS);
	};

	const endSignIn = () => {
		finishingSignInRef.current = false;
		signingInRef.current = false;
		setSigningIn(false);
		webViewRef.current?.injectJavaScript(HIDE_SIGN_IN_COVER_JS);
	};

	// The cover goes up once Google has opened over the app, so it is in place on the way back.
	useEffect(() => {
		const subscription = AppState.addEventListener('change', state => {
			if (state !== 'active' && googleOpenRef.current) coverSignIn();
		});
		return () => subscription.remove();
	}, []);

	const hideSplash = () => {
		setSplashVisible(false);
		SplashScreen.hideAsync().catch(() => {});
	};

	// On a slow connection, switch to the loading screen so the app does not look frozen.
	useEffect(() => {
		const timer = setTimeout(hideSplash, SPLASH_MAX_MS);
		return () => clearTimeout(timer);
	}, []);

	// Hands the push token to the page and registers this phone for the signed-in person.
	// Called whenever either one may have just become available.
	const registerPushToken = () => {
		if (expoPushTokenRef.current) webViewRef.current?.injectJavaScript(registerPushTokenJs(expoPushTokenRef.current));
	};

	// Get Expo push token on startup and store it so we can inject it into the WebView.
	useEffect(() => {
		(async () => {
			try {
				if (Platform.OS === 'android') {
					await Notifications.setNotificationChannelAsync('default', {
						name: 'WorkMate',
						importance: Notifications.AndroidImportance.HIGH
					});
				}
				const { status } = await Notifications.requestPermissionsAsync();
				if (status !== 'granted') return;
				const tokenData = await Notifications.getExpoPushTokenAsync();
				expoPushTokenRef.current = tokenData.data;
				registerPushToken();
			} catch {
				// Push token is non-critical; silently ignore errors.
			}
		})();
	}, []);

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
		if (!isWorkMateUrl(event.nativeEvent.url)) return;
		let message;
		try {
			message = JSON.parse(event.nativeEvent.data);
		} catch {
			return;
		}

		if (message?.type === 'dilg-signed-in') {
			finishingSignInRef.current = false;
			signingInRef.current = false;
			setSigningIn(false);
			registerPushToken();
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
			let payload = null;
			try {
				// PKCE: the backend only returns a short-lived code in the redirect, and only this
				// app instance knows the verifier needed to exchange it for a session token.
				const codeVerifier = toBase64Url(Crypto.getRandomBytes(32));
				const codeChallenge = toBase64Url(new Uint8Array(await Crypto.digest(
					Crypto.CryptoDigestAlgorithm.SHA256,
					new TextEncoder().encode(codeVerifier)
				)));
				const authUrl = `${configuredWebAppUrl}/api/auth/google/url?mobile=1&code_challenge=${codeChallenge}`;
				googleOpenRef.current = true;
				const result = await WebBrowser.openAuthSessionAsync(authUrl, MOBILE_REDIRECT_URI);
				googleOpenRef.current = false;
				if (result.type === 'success' && result.url) {
					coverSignIn();
					const callbackUrl = new URL(result.url);
					const code = callbackUrl.searchParams.get('code');
					const error = callbackUrl.searchParams.get('error');
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
				}
			} catch (error) {
				payload = { type: 'google-login-failure', error: error.message };
			} finally {
				googleOpenRef.current = false;
			}
			if (payload?.type === 'google-login-success') {
				finishingSignInRef.current = true;
				// The token is saved first, so if the page reloads now (for example, to pick up a new
				// version), it still opens signed in.
				webViewRef.current?.injectJavaScript(
					`try { localStorage.setItem('dilg_auth_token', ${JSON.stringify(payload.token)}); } catch (e) {} window.postMessage(${JSON.stringify(payload)}, '*'); true;`
				);
				webViewRef.current?.injectJavaScript(WATCH_FOR_DASHBOARD_JS);
				setTimeout(() => { if (finishingSignInRef.current) endSignIn(); }, SIGN_IN_COVER_MAX_MS + 2000);
			} else {
				if (payload) {
					webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(payload)}, '*'); true;`);
				}
				endSignIn();
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
				onShouldStartLoadWithRequest={handleNavigationRequest}
				setSupportMultipleWindows={false}
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
					pageReadyRef.current = false;
					setLoading(true);
					setHasError(false);
				}}
				onLoadEnd={() => {
					setLoading(false);
					hideSplash();
					// The page reloaded during a Google sign-in: cover it again until the dashboard shows.
					if (signingInRef.current) webViewRef.current?.injectJavaScript(SHOW_SIGN_IN_COVER_JS);
					if (finishingSignInRef.current) webViewRef.current?.injectJavaScript(WATCH_FOR_DASHBOARD_JS);
					registerPushToken();
					pageReadyRef.current = true;
					deliverNotificationToOpen();
				}}
				onError={() => {
					setLoading(false);
					setHasError(true);
					hideSplash();
				}}
				onMessage={handleWebViewMessage}
				onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
			/>
			{/* During a Google sign-in the page shows its own spinner, so this one stays hidden. */}
			{loading && !splashVisible && !signingIn && (
				<View style={styles.loader}>
					<ActivityIndicator size="large" color="#1e40af" />
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
		backgroundColor: '#ffffff',
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
