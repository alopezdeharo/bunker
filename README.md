# El Bunker

Web personal para reuniones en casa. Permite descubrir juegos de mesa, videojuegos, tés, cócteles y picoteo según el número de personas y el tipo de plan.

## Stack

- **Hosting:** Firebase Hosting (Spark)
- **Base de datos:** Cloud Firestore (Spark)
- **Autenticación:** Firebase Anonymous Auth + Email/Password
- **Frontend:** HTML + CSS + JavaScript (sin frameworks)

## Estructura

```
public/
├── index.html        ← aplicación principal
├── admin.html        ← panel de administración (acceso restringido)
├── css/styles.css
├── js/
│   ├── app.js
│   └── firebase-config.js
└── images/items/     ← imágenes del catálogo
```

## Despliegue

```bash
firebase deploy --only hosting
```

## Desarrollo local

```bash
firebase serve
```
