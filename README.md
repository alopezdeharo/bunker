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
│   ├── admin.html              # panel de administración
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js              # lógica de la aplicación
│   │   └── firebase-config.js  # inicialización del SDK
│   └── images/
│       ├── *.png               # ilustraciones de categorías
│       └── items/              # imágenes del catálogo
├── scripts/
│   └── set-admin.js            # script de configuración inicial (Admin SDK)
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
# Descargar service account key desde Firebase Console → Project Settings → Service accounts
node set-admin.js ./clave.json email@ejemplo.com
# Eliminar la clave tras ejecutarlo
```

## Modelo de datos (Firestore)

Tres colecciones:

- **`items`** — catálogo (juegos, bebidas, comida). Campos principales: `name`, `category`, `active`, `secret`, `availability`, `kind`, `details` (campos específicos por categoría).
- **`comments`** — comentarios de invitados, asociados a un `itemId` y un `uid` anónimo.
- **`ratings`** — valoraciones 1–5. ID de documento: `{itemId}_{uid}`.
