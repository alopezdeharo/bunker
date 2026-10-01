# Bunker

Herramienta web personal para reuniones en casa. Permite descubrir qué jugar, qué tomar o qué preparar según el número de personas y el tiempo disponible, sin tener que recordar manualmente todo lo que hay disponible.

Accesible mediante código QR. Sin registro para los usuarios.

## Tecnología

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (ES modules, sin frameworks) |
| Base de datos | Cloud Firestore (Firebase) |
| Autenticación | Firebase Anonymous Auth (usuarios) + Email/Password (admin) |
| Hosting | Firebase Hosting |
| CI/CD | Firebase CLI (`firebase deploy`) |

Todo el proyecto corre sobre el plan gratuito de Firebase (Spark), sin coste operativo y sin dependencias externas más allá del SDK de Firebase.

## Arquitectura

```
Firebase (plan Spark)
├── Hosting          → archivos estáticos (HTML, CSS, JS, imágenes)
├── Firestore        → catálogo de items, comentarios y valoraciones
└── Authentication   → identidades anónimas para invitados, email para admin
```

El catálogo se carga por categoría y los filtros se aplican en cliente, lo que minimiza las lecturas a Firestore y hace los filtros instantáneos sin consultas adicionales.

Las valoraciones se agregan en cliente sobre los documentos cargados, evitando la necesidad de Cloud Functions o agregaciones del lado del servidor.

## Seguridad

- Las Firestore Security Rules controlan qué puede leer y escribir cada tipo de usuario.
- Los privilegios de administrador se gestionan mediante **Firebase Custom Claims** (`admin: true`), asignados con el Firebase Admin SDK. El email del administrador no aparece en ningún archivo del repositorio.
- Los comentarios tienen validación de longitud (máx. 500 caracteres) y el campo `hidden` solo puede ser modificado por el administrador.
- Las valoraciones usan un ID de documento compuesto `{itemId}_{uid}` que garantiza una sola valoración por usuario anónimo por item.
- Las claves del cliente Firebase (`apiKey`, `appId`, etc.) son identificadores públicos por diseño. La seguridad no depende de ocultarlos, sino de las Security Rules.

## Estructura del proyecto

```
bunker/
├── public/
│   ├── index.html              # aplicación principal (SPA con router por hash)
│   ├── 404.html                # página de error
│   ├── admin.html              # panel de administración (pendiente)
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js              # lógica de la aplicación
│   │   └── firebase-config.js  # inicialización del SDK
│   └── images/
│       ├── *.webp              # ilustraciones de categorías
│       └── items/              # imágenes del catálogo
├── scripts/
│   ├── set-admin.js            # asigna el rol de administrador (Admin SDK)
│   ├── seed-items.js           # carga items de prueba en Firestore
│   └── optimize-images.js      # convierte las ilustraciones PNG a WebP
├── assets-src/                 # ilustraciones originales (PNG), fuera del despliegue
├── firestore.rules             # reglas de seguridad de Firestore
├── firestore.indexes.json
└── firebase.json
```

## Despliegue

Requiere [Firebase CLI](https://firebase.google.com/docs/cli) y acceso al proyecto `mibunker`.

```bash
# Desplegar hosting y rules
firebase deploy

# Solo hosting
firebase deploy --only hosting

# Solo rules
firebase deploy --only firestore:rules
```

## Configuración inicial (una sola vez)

Para asignar privilegios de administrador a un usuario ya registrado en Firebase Authentication:

```bash
cd scripts
npm install
# Descargar la clave de cuenta de servicio desde Firebase Console → Configuración del proyecto → Cuentas de servicio
node set-admin.js ./clave.json email@ejemplo.com
# Eliminar la clave tras ejecutarlo
```

## Scripts de apoyo

Todos se ejecutan desde `scripts/` tras `npm install`.

```bash
# Cargar items de prueba (IDs con prefijo seed_, se pueden repetir sin duplicar)
node seed-items.js ./clave.json

# Borrarlos
node seed-items.js ./clave.json --borrar

# Convertir las ilustraciones PNG de public/images a WebP
node optimize-images.js
```

La clave de cuenta de servicio no debe subirse nunca al repositorio; el `.gitignore` ya excluye los nombres habituales.

## Modelo de datos (Firestore)

Tres colecciones:

- **`items`** — catálogo (juegos, bebidas, comida). Campos principales: `name`, `category`, `active`, `secret`, `availability`, `kind`, `details` (campos específicos por categoría).
- **`comments`** — comentarios de invitados, asociados a un `itemId` y un `uid` anónimo.
- **`ratings`** — valoraciones 1–5. ID de documento: `{itemId}_{uid}`.
