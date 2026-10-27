import { StyleSheet, Text, View } from 'react-native';
import { BRAND, BRAND_DARK, BUMPER, INK, PLATE, SIGN } from './theme';

/** Frente del colectivo: letrero blanco, número de coche y firma, como la unidad de El Urbano. */
export function NumeroCoche({
  numero,
  patente,
  compacto = false,
}: {
  numero: string;
  patente?: string;
  compacto?: boolean;
}) {
  const visible = numero.trim() || '—';
  return (
    <View style={[styles.bus, compacto ? styles.busCompacto : null]} accessibilityLabel={`Coche ${visible}`}>
      <View style={[styles.letrero, compacto ? styles.letreroCompacto : null]}>
        <Text style={[styles.letreroTxt, compacto ? styles.letreroTxtCompacto : null]}>EL URBANO</Text>
      </View>
      <View style={[styles.cuerpo, compacto ? styles.cuerpoCompacto : null]}>
        <View style={[styles.placa, compacto ? styles.placaCompacta : null]}>
          {compacto ? null : <Text style={styles.placaEtiqueta}>Coche</Text>}
          <Text
            style={[styles.numero, compacto ? styles.numeroCompacto : null]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {visible}
          </Text>
        </View>
        {compacto ? null : <Text style={styles.firma}>El Urbano</Text>}
        {compacto || !patente ? null : <Text style={styles.patente}>{patente}</Text>}
      </View>
      <View style={[styles.paragolpes, compacto ? styles.paragolpesCompacto : null]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bus: {
    backgroundColor: BRAND,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: BRAND_DARK,
    alignSelf: 'stretch',
  },
  busCompacto: {
    width: 112,
    borderRadius: 10,
    alignSelf: 'auto',
  },
  letrero: {
    alignSelf: 'stretch',
    backgroundColor: SIGN,
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: INK,
  },
  letreroCompacto: {
    marginHorizontal: 6,
    marginTop: 6,
    paddingVertical: 3,
    borderWidth: 1,
  },
  letreroTxt: {
    color: BRAND_DARK,
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 1.5,
  },
  letreroTxtCompacto: {
    fontSize: 8,
    letterSpacing: 0.4,
  },
  cuerpo: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  cuerpoCompacto: {
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  placa: {
    backgroundColor: PLATE,
    borderRadius: 4,
    minWidth: 96,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#9aa0a6',
    alignItems: 'center',
  },
  placaCompacta: {
    minWidth: 0,
    alignSelf: 'stretch',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
  },
  placaEtiqueta: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#333',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  numero: {
    fontSize: 48,
    fontWeight: '900',
    color: INK,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  numeroCompacto: {
    fontSize: 22,
    letterSpacing: 0,
  },
  firma: {
    color: '#fff',
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 22,
    marginTop: 8,
  },
  patente: {
    color: '#ffe4e2',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 2,
  },
  paragolpes: {
    height: 14,
    backgroundColor: BUMPER,
    borderTopWidth: 2,
    borderTopColor: '#9ea4aa',
  },
  paragolpesCompacto: {
    height: 6,
    borderTopWidth: 1,
  },
});
