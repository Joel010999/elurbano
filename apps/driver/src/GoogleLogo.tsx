import { Image, StyleSheet } from 'react-native';

const MARCA = require('../assets/google-g.png');

/** Marca oficial de Google: G azul, rojo, amarillo y verde. */
export function GoogleLogo({ size = 22 }: { size?: number }) {
  return (
    <Image
      source={MARCA}
      style={[styles.logo, { width: size, height: size }]}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  logo: { width: 22, height: 22 },
});
