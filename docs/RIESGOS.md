# El Urbano - Análisis de Riesgos y Desafíos

## Descripción General

Este documento identifica los riesgos técnicos, operativos y de implementación del proyecto El Urbano, junto con estrategias de mitigación.

## Riesgos Técnicos

### 1. GPS en Background - Alta Complejidad

**Descripción:**
El rastreo GPS en segundo plano es técnicamente complejo y varía significativamente entre iOS y Android.

**Impacto:** Alto
**Probabilidad:** Alta

**Riesgos específicos:**
- iOS puede pausar actualizaciones de ubicación de forma impredecible
- Android 12+ requiere permisos explícitos y puede ser denegado por usuarios
- Foreground services pueden ser terminados por el sistema en condiciones de baja memoria
- Precision degradada en áreas con mala cobertura GPS

**Mitigación:**
- ✅ Documentación técnica detallada (EXPO_GPS.md)
- Pruebas exhaustivas en dispositivos reales (no solo emuladores)
- Implementar cola offline para pings no enviados
- Fallback a tracking en foreground si background permission denegado
- Monitoreo de salud del GPS en dashboard inspector

### 2. Consumo de Batería Excesivo

**Descripción:**
El tracking GPS continuo consume batería rápidamente, especialmente con alta frecuencia de updates.

**Impacto:** Alto
**Probabilidad:** Media-Alta

**Riesgos específicos:**
- Choferes desinstalan la app o desactivan GPS
- Dispositivos se apagan a mitad de turno
- Reputación negativa de la app

**Mitigación:**
- Usar `Accuracy.Balanced` en lugar de `High`
- Intervalos de 15 segundos + 50 metros (no más frecuente)
- Pausar tracking si el coche está detenido >5 minutos
- Documentar requirement de mantener dispositivo cargado
- Considerar proveer car chargers a choferes

### 3. Confiabilidad de Conectividad

**Descripción:**
Los colectivos pueden transitar por zonas sin cobertura de datos móviles.

**Impacto:** Medio
**Probabilidad:** Alta

**Riesgos específicos:**
- Pérdida de pings durante túneles, zonas rurales
- Mapa del inspector muestra datos desactualizados
- Usuarios públicos ven ubicaciones incorrectas

**Mitigación:**
- ✅ Cola de pings offline con AsyncStorage
- Endpoint `/api/urbano/ping/batch` para envío en lote
- TTL en Redis para marcar coches como "offline" si >10 min sin ping
- UI del inspector indica claramente timestamp del último ping
- Mostrar "Última actualización: hace X minutos" en mapa público

### 4. Dependencia de Componentes de ColeJUY

**Descripción:**
El proyecto reutiliza componentes visuales y de mapa de `FrancoDuran23/colejuy`.

**Impacto:** Medio-Alto
**Probabilidad:** Baja-Media

**Riesgos específicos:**
- Cambios en repo colejuy rompen compatibilidad
- Componentes no son fácilmente extraíbles/reutilizables
- Licencia del código no permite reutilización
- Dependencias circulares entre repos

**Mitigación:**
- **NO modificar** repo colejuy desde este proyecto
- Copiar/adaptar componentes en lugar de importar directamente (si es necesario)
- Documentar exactamente qué componentes se reutilizan y de dónde
- Versionado: si se importan, fijar versión específica (no `latest`)
- Plan B: implementar mapa básico con Mapbox/Google Maps si reutilización falla

### 5. Escalabilidad de Redis

**Descripción:**
Uso de Redis para almacenar última ubicación de cada coche.

**Impacto:** Bajo-Medio
**Probabilidad:** Baja

**Riesgos específicos:**
- Crecimiento de memoria si no se configuran TTLs
- Pérdida de datos si Redis se reinicia (sin persistencia)
- Contención en escrituras con flota grande (>100 coches)

**Mitigación:**
- Configurar TTL de 24 horas en todas las keys
- Habilitar persistencia RDB en Redis (snapshots)
- Monitorear uso de memoria
- Considerar Redis Cluster si flota supera 500 coches activos

## Riesgos Operativos

### 6. Adopción por Choferes

**Descripción:**
Los choferes deben usar la app activamente durante su turno.

**Impacto:** Alto
**Probabilidad:** Media

**Riesgos específicos:**
- Resistencia al cambio (especialmente choferes mayores)
- Olvido de iniciar/finalizar turno
- Desactivación manual de GPS por privacidad
- Falta de capacitación adecuada

**Mitigación:**
- UX extremadamente simple (botón grande "Iniciar Turno")
- Notificación persistente como recordatorio de turno activo
- Capacitación presencial con demostraciones
- Incentivos para uso correcto (gamificación leve)
- Soporte técnico accesible (WhatsApp, teléfono)

### 7. Precisión de Asignación Coche-Línea

**Descripción:**
El inspector debe asignar manualmente cada coche a su línea del día.

**Impacto:** Medio
**Probabilidad:** Media

**Riesgos específicos:**
- Error humano: asignar coche a línea incorrecta
- Reasignaciones no comunicadas (cambios de último momento)
- Información desactualizada en mapa público

**Mitigación:**
- UI clara con confirmación de asignación
- Log de cambios de asignación (auditoría)
- Validación: alertar si un coche tiene pings pero no tiene línea asignada
- Permitir auto-detección de línea basada en geofencing (fase futura)

### 8. Control de Visibilidad Pública

**Descripción:**
Inspector controla qué coches son visibles en ColeJUY con checkbox `visibleEnColejuy`.

**Impacto:** Bajo-Medio
**Probabilidad:** Baja

**Riesgos específicos:**
- Olvidar activar visibilidad de coches operativos
- Coches con problemas siguen visibles públicamente
- Confusión sobre qué coches deberían ser públicos

**Mitigación:**
- Default: `visibleEnColejuy = true` al crear un coche
- Filtro rápido en UI inspector para ver solo "visibles" u "ocultos"
- Indicador visual claro de estado (icono 👁️ / 🚫)
- Lógica automática: ocultar si no hay ping en >30 minutos

## Riesgos de Seguridad

### 9. Autenticación con Tokens Compartidos

**Descripción:**
Modelo simple de auth con `choferToken` e `inspectorToken` compartidos.

**Impacto:** Medio-Alto
**Probabilidad:** Media

**Riesgos específicos:**
- Token de chofer filtrado puede usarse para falsificar ubicaciones
- Token de inspector filtrado da control total de la flota
- Falta de rotación de tokens
- No hay revocación individual

**Mitigación:**
- Tokens suficientemente largos y random (UUID v4 mínimo)
- HTTPS obligatorio en API (TLS 1.2+)
- Rate limiting por token (máx 4 pings/min por chofer)
- IP whitelisting para inspector token (solo desde oficina)
- Logging de todas las acciones con inspector token
- Plan futuro: migrar a JWT con expiración y refresh tokens

### 10. Exposición de Ubicaciones en Tiempo Real

**Descripción:**
La vista pública expone ubicación exacta de colectivos.

**Impacto:** Bajo
**Probabilidad:** Baja

**Riesgos específicos:**
- Información podría ser utilizada maliciosamente
- Privacidad de choferes (tracking de personas)
- Scraping de datos de ubicación

**Mitigación:**
- Solo mostrar coches con `visibleEnColejuy = true`
- Rate limiting en endpoint público (60 requests/minuto por IP)
- CAPTCHA si se detecta patrón de scraping
- No exponer ID de chofer en API pública
- Redondear coordenadas a 4 decimales (~11 metros de precisión) en vista pública

### 11. Validación de Datos de GPS

**Descripción:**
Pings podrían ser falsificados o contener datos incorrectos.

**Impacto:** Medio
**Probabilidad:** Baja-Media

**Riesgos específicos:**
- Coordenadas (0, 0) o fuera de área de servicio
- Accuracy muy baja (>500m) indica GPS sin señal
- Timestamps en futuro o demasiado en el pasado
- Velocidad imposible (>200 km/h)

**Mitigación:**
- Validación server-side de rangos de lat/lng
- Rechazar pings con accuracy > 100 metros
- Validar timestamp dentro de ±5 minutos del server time
- Detectar teleportación: rechazar si distancia/tiempo implica >150 km/h
- Logging de pings rechazados para análisis

## Riesgos de Integración

### 12. Reutilización de Mapa de ColeJUY

**Descripción:**
El mapa del inspector y vista pública reutilizan componentes de ColeJUY.

**Impacto:** Medio
**Probabilidad:** Media

**Riesgos específicos:**
- Componentes hardcoded con branding ColeJUY
- Dependencias no compartidas entre repos
- Versiones incompatibles de librerías (React, Mapbox, etc.)
- Estilos CSS conflictivos

**Mitigación:**
- Auditoría de componentes ColeJUY antes de integración
- Abstraer branding en props/themes configurables
- Alinear versiones de dependencias principales
- Namespacing de CSS con prefijo `urbano-`
- Testing de integración en ambiente staging

### 13. Sincronización de Datos entre Urbano y ColeJUY

**Descripción:**
La vista pública de ColeJUY debe mostrar coches de El Urbano.

**Impacto:** Medio
**Probabilidad:** Baja

**Riesgos específicos:**
- Inconsistencias de datos entre sistemas
- Retrasos de propagación de cambios
- Conflictos de IDs de coches

**Mitigación:**
- API de El Urbano es fuente de verdad para sus coches
- ColeJUY consume endpoint público de Urbano
- IDs de coches prefijados con `urbano-` para evitar colisiones
- Caché corto (30 segundos) en ColeJUY para datos de Urbano

## Riesgos de Proyecto

### 14. Alcance Ambiguo o Creciente

**Descripción:**
Requests de features adicionales durante desarrollo.

**Impacto:** Alto
**Probabilidad:** Alta

**Riesgos específicos:**
- "También queremos chat entre inspector y chofer"
- "Agregar historial de recorridos"
- "Reportes de incidentes"
- Timeline del proyecto se extiende indefinidamente

**Mitigación:**
- ✅ Documento de alcance claro (SCOPE.md)
- Sección "Exclusiones Explícitas" bien definida
- Proceso formal de change requests
- Comunicar impacto en timeline de cada feature adicional
- Definir fases claras: MVP primero, features avanzadas después

### 15. Falta de Testing en Dispositivos Reales

**Descripción:**
GPS en background solo funciona correctamente en dispositivos físicos.

**Impacto:** Alto
**Probabilidad:** Media

**Riesgos específicos:**
- Funciona en emulador pero falla en producción
- Problemas específicos de modelos de dispositivos
- Diferencias entre versiones de Android/iOS

**Mitigación:**
- Budget para adquirir 2-3 dispositivos de testing (Android + iOS)
- Testing beta con choferes en turnos reales
- Matriz de compatibilidad: Android 10+, iOS 14+
- Monitoreo de crash reports (Sentry, Bugsnag)

## Matriz de Riesgos

| # | Riesgo | Impacto | Probabilidad | Prioridad |
|---|--------|---------|--------------|-----------|
| 1 | GPS Background | Alto | Alta | **Crítico** |
| 2 | Batería | Alto | Media-Alta | **Crítico** |
| 6 | Adopción Choferes | Alto | Media | **Alto** |
| 9 | Auth Tokens | Medio-Alto | Media | **Alto** |
| 14 | Scope Creep | Alto | Alta | **Alto** |
| 4 | Dependencia ColeJUY | Medio-Alto | Baja-Media | Medio |
| 3 | Conectividad | Medio | Alta | Medio |
| 7 | Asignación Manual | Medio | Media | Medio |
| 12 | Integración Mapa | Medio | Media | Medio |
| 5 | Redis Escalabilidad | Bajo-Medio | Baja | Bajo |
| 11 | Validación GPS | Medio | Baja-Media | Bajo |

## Plan de Acción Inmediato

### Prioridad 1 (Pre-desarrollo)
1. ✅ Documentar alcance claramente (SCOPE.md)
2. ✅ Documentar implementación GPS (EXPO_GPS.md)
3. ✅ Identificar riesgos (RIESGOS.md)
4. Auditar componentes reutilizables de ColeJUY
5. Definir estrategia de auth tokens

### Prioridad 2 (Desarrollo)
1. Implementar cola offline para pings
2. Implementar rate limiting en API
3. Testing GPS en dispositivos reales
4. Monitoreo de batería en app

### Prioridad 3 (Pre-producción)
1. Beta testing con choferes reales
2. Load testing de API con flota simulada
3. Configuración de monitoring y alertas
4. Plan de rollback si falla en producción

## Conclusión

El proyecto El Urbano presenta riesgos técnicos significativos, principalmente alrededor del GPS en background y la adopción por usuarios. Sin embargo, con documentación clara, mitigaciones apropiadas, y un enfoque de desarrollo por fases, estos riesgos son manejables.

**Recomendación:** Proceder con MVP enfocado en funcionalidad core (GPS + mapa inspector) antes de agregar features avanzadas.
