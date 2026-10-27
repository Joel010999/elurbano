import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri, ResponseType, type AuthSessionResult } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } from './api';
import { GoogleLogo } from './GoogleLogo';
import { BRAND, BRAND_DARK, INK, SIGN } from './theme';

WebBrowser.maybeCompleteAuthSession();

function idTokenDe(result: AuthSessionResult): string {
  if (result.type !== 'success') return '';
  return result.params.id_token || result.authentication?.idToken || '';
}

function mensajeGoogle(result: AuthSessionResult): string {
  if (result.type !== 'error') return 'No se pudo entrar con Google';
  return result.error?.message || result.params.error_description || result.params.error || 'No se pudo entrar con Google';
}

function BotonGoogle({
  disabled,
  onIdToken,
  onError,
}: {
  disabled: boolean;
  onIdToken: (idToken: string) => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const redirectUri = useMemo(
    () => GOOGLE_REDIRECT_URI || makeRedirectUri({ scheme: 'urbano-driver', path: 'redirect' }),
    [],
  );
  const [request, , promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_CLIENT_ID,
    androidClientId: GOOGLE_CLIENT_ID,
    redirectUri,
    responseType: ResponseType.IdToken,
    selectAccount: true,
    language: 'es',
    scopes: ['openid', 'profile', 'email'],
  });
  const [abriendo, setAbriendo] = useState(false);
  const ocupado = disabled || abriendo || !request;

  async function entrar() {
    if (!request || disabled || abriendo) return;
    setAbriendo(true);
    onError('');
    try {
      const result = await promptAsync();
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success') {
        onError(mensajeGoogle(result));
        return;
      }
      const idToken = idTokenDe(result);
      if (!idToken) {
        onError('Google no devolvió un idToken.');
        return;
      }
      await onIdToken(idToken);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo entrar con Google');
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Entrar con Google"
        disabled={ocupado}
        onPress={() => void entrar()}
        style={[styles.google, ocupado && styles.off]}
      >
        {abriendo ? <ActivityIndicator color={BRAND} /> : <GoogleLogo />}
        <Text style={styles.googleTxt}>Entrar con Google</Text>
      </Pressable>
      {__DEV__ ? <Text style={styles.redirect}>Redirect: {redirectUri}</Text> : null}
    </View>
  );
}

export function LoginScreen({
  ocupado,
  error,
  onClave,
  onGoogle,
}: {
  ocupado: boolean;
  error: string | null;
  onClave: (usuario: string, clave: string) => void;
  onGoogle: (idToken: string) => Promise<void>;
}) {
  const [usuario, setUsuario] = useState('chofer-demo');
  const [clave, setClave] = useState('1');
  const [local, setLocal] = useState<string | null>(null);
  const aviso = local || error;

  function entrarConClave() {
    const user = usuario.trim();
    const pass = clave.trim();
    if (!user || !pass) {
      setLocal('Usuario y clave requeridos');
      return;
    }
    setLocal(null);
    onClave(user, pass);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.letrero}>
          <Text style={styles.letreroTxt}>EL URBANO</Text>
        </View>
        <Text style={styles.firma}>Chofer</Text>

        {GOOGLE_CLIENT_ID ? (
          <BotonGoogle
            disabled={ocupado}
            onIdToken={onGoogle}
            onError={(mensaje) => setLocal(mensaje || null)}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entrar con Google"
            onPress={() => setLocal('Google no está configurado (EXPO_PUBLIC_GOOGLE_CLIENT_ID).')}
            style={styles.google}
          >
            <GoogleLogo />
            <Text style={styles.googleTxt}>Entrar con Google</Text>
          </Pressable>
        )}

        <Text style={styles.o}>o con usuario y clave</Text>

        <Text style={styles.label}>Usuario</Text>
        <TextInput
          value={usuario}
          onChangeText={setUsuario}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          editable={!ocupado}
          style={styles.input}
        />
        <Text style={styles.label}>Clave</Text>
        <TextInput
          value={clave}
          onChangeText={setClave}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          editable={!ocupado}
          style={styles.input}
        />

        {aviso ? <Text style={styles.error}>{aviso}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={ocupado}
          onPress={entrarConClave}
          style={[styles.entrar, ocupado && styles.off]}
        >
          {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={styles.entrarTxt}>Entrar</Text>}
        </Pressable>
        <Text style={styles.demo}>Demo: chofer-demo / 1</Text>
        <Text style={styles.host}>{API_BASE.replace(/^https?:\/\//, '')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: 28 },
  letrero: {
    backgroundColor: SIGN,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: INK,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  letreroTxt: {
    color: BRAND_DARK,
    fontWeight: '900',
    fontSize: 26,
    letterSpacing: 2,
  },
  firma: {
    color: BRAND,
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  google: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dadce0',
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleTxt: { color: INK, fontWeight: '700', fontSize: 16 },
  redirect: { color: '#888', fontSize: 11, marginTop: 6 },
  o: { textAlign: 'center', color: '#777', marginVertical: 16, fontSize: 13 },
  label: { fontSize: 13, color: '#666', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 18,
    color: INK,
    marginBottom: 12,
  },
  error: { color: BRAND, textAlign: 'center', marginBottom: 10, fontSize: 14 },
  entrar: {
    backgroundColor: BRAND,
    borderRadius: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entrarTxt: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  off: { opacity: 0.6 },
  demo: { textAlign: 'center', color: '#777', marginTop: 14, fontSize: 13 },
  host: { textAlign: 'center', color: '#aaa', marginTop: 6, fontSize: 11 },
});
