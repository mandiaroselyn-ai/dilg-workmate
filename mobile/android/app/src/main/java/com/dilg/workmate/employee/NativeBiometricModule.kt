package com.dilg.workmate.employee

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class NativeBiometricModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val KEY_ALIAS_PREFIX = "dilg-workmate-biometric-"
    private const val KEYSTORE = "AndroidKeyStore"
  }

  override fun getName() = "NativeBiometric"

  @ReactMethod
  fun signChallenge(challenge: String, keyId: String, promise: Promise) {
    if (challenge.isBlank() || challenge.length > 128 || !keyId.matches(Regex("[a-f0-9]{32}"))) {
      promise.reject("E_INVALID_CHALLENGE", "The biometric challenge is invalid.")
      return
    }

    val activity = currentActivity as? FragmentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "The app is not ready to request fingerprint verification.")
      return
    }

    try {
      val biometricManager = BiometricManager.from(activity)
      val allowedAuthenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK
      val authenticationStatus = biometricManager.canAuthenticate(allowedAuthenticators)
      if (authenticationStatus != BiometricManager.BIOMETRIC_SUCCESS) {
        when (authenticationStatus) {
          BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
            promise.reject("E_BIOMETRIC_UNSUPPORTED", "This device does not have a fingerprint sensor.")
          BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
            promise.reject("E_BIOMETRIC_UNAVAILABLE", "The fingerprint sensor is currently unavailable. Please try again.")
          BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
            promise.reject("E_BIOMETRIC_ENROLL", "Register at least one fingerprint or face unlock in your device settings, then retry.")
          else ->
            promise.reject("E_BIOMETRIC_UNAVAILABLE", "Phone fingerprint verification is not available on this device.")
        }
        return
      }

      val keyAlias = KEY_ALIAS_PREFIX + keyId
      val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
      val privateKey = (keyStore.getKey(keyAlias, null) as? java.security.PrivateKey)
        ?: run {
          val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
          val builder = KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setInvalidatedByBiometricEnrollment(true)
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
              0,
              KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_BIOMETRIC_WEAK
            )
          } else {
            @Suppress("DEPRECATION")
            builder.setUserAuthenticationValidityDurationSeconds(-1)
          }
          generator.initialize(builder.build())
          generator.generateKeyPair().private
        }

      val signature = Signature.getInstance("SHA256withECDSA").apply { initSign(privateKey) }
      val publicKey = Base64.encodeToString(
        keyStore.getCertificate(keyAlias).publicKey.encoded,
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
      )
      val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(reactContext),
        object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            try {
              val authenticatedSignature = result.cryptoObject?.signature
                ?: throw IllegalStateException("Fingerprint authorization did not unlock the signing key.")
              authenticatedSignature.update(challenge.toByteArray(Charsets.UTF_8))
              val signedChallenge = Base64.encodeToString(
                authenticatedSignature.sign(),
                Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
              )
              val response = Arguments.createMap().apply {
                putString("signature", signedChallenge)
                putString("publicKey", publicKey)
              }
              promise.resolve(response)
            } catch (error: Exception) {
              promise.reject("E_BIOMETRIC_SIGN", "Could not sign the fingerprint challenge.", error)
            }
          }

          override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            promise.reject("E_BIOMETRIC_AUTH", errString.toString())
          }
        }
      )
      val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Verify your identity")
        .setSubtitle("Use your fingerprint to clock in")
        .setNegativeButtonText("Cancel")
        .setAllowedAuthenticators(allowedAuthenticators)
        .build()
      prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(signature))
    } catch (error: Exception) {
      promise.reject("E_BIOMETRIC_SETUP", "Phone fingerprint verification is unavailable.", error)
    }
  }
}
