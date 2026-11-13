# Hangari — plataforma de pedidos navideños

MVP frontend en HTML, CSS y JavaScript vanilla, con Supabase como backend.

## Incluye
- Catálogo por categorías: Proteínas, Ensaladas, Platos y Novenitas.
- Carrito con cantidades y total.
- Formulario de pedido: cliente, celular, dirección, fecha, vendedor opcional y medio de pago.
- Creación de pedidos mediante RPC segura: el precio se calcula en Supabase, no en el navegador.
- Acceso privado con Supabase Auth.
- Roles `admin` y `delivery`.
- Panel de pedidos, confirmación de pago, asignación de domiciliario y actualización de estados.
- Row Level Security (RLS): los clientes no pueden consultar pedidos; cada domiciliario ve solo los pedidos asignados.

## 1. Crear proyecto Supabase
1. Crea un proyecto en https://supabase.com.
2. Abre **SQL Editor** y ejecuta todo el contenido de `supabase.sql`.
3. En **Project Settings > API**, copia Project URL y la `anon` / publishable key.
4. Pega ambos valores en `config.js`.
5. En Authentication > Users, crea manualmente las cuentas del equipo (correo y contraseña).
6. Copia el UUID de cada usuario y ejecuta en SQL Editor, por ejemplo:

```sql
insert into public.profiles(id, full_name, role)
values ('UUID_DEL_USUARIO', 'Administrador Hangari', 'admin');

insert into public.profiles(id, full_name, role)
values ('UUID_DEL_DOMICILIARIO', 'Carlos Pérez', 'delivery');
```

No compartas la service_role key ni la uses en el frontend.

## 2. Ejecutar localmente
Abre la carpeta con VS Code y usa una extensión de servidor local como **Live Server**. También puedes desplegar los archivos estáticos en Netlify, Vercel o el hosting de tu preferencia.

No es recomendable abrir `index.html` directamente como `file://`; utiliza un servidor local.

## 3. Personalizar el catálogo
Los productos de demostración se insertan desde `supabase.sql`. Cambia nombres, descripciones, categorías, precios, unidades e imágenes por el menú real de Hangari. Para agregar o editar productos después, usa el SQL Editor o el Table Editor de Supabase.

## 4. Flujo operativo
- El cliente registra el pedido: estado `Pendiente`, pago `Pendiente`.
- Administrador confirma el pedido.
- Administrador marca el pago como `Pagado` cuando lo verifica.
- Administrador asigna un domiciliario: estado `Asignado`.
- Domiciliario cambia a `En camino` y luego `Entregado`.

El estado de pago y el estado de entrega son independientes.

## 5. Antes de producción
Este proyecto es una base funcional inicial, no una solución auditada para operación masiva. Antes de publicar:
- Reemplaza los productos, fotografías y precios de ejemplo.
- Define horarios, cobertura, anticipación mínima, cupos por fecha y política de cancelaciones.
- Configura backups, monitoreo y límites antiabuso para el endpoint público (por ejemplo, rate limiting/WAF o una Edge Function).
- Añade confirmaciones de pedido por WhatsApp/correo si se requieren.
- Considera que la asignación de domiciliarios usa un `prompt()` sencillo; conviene cambiarlo por un selector visual.
- Revisa el diseño responsive, accesibilidad y políticas de tratamiento de datos personales (Ley 1581 de 2012 en Colombia).
- No se integra una pasarela de pago: el sistema registra el medio de pago y permite al administrador marcarlo como recibido.
- Añade una función de auditoría para registrar quién cambió estados y cuándo, antes de una operación con varios colaboradores.

## Variables necesarias
`config.js`:
- `SUPABASE_URL`: URL pública del proyecto.
- `SUPABASE_ANON_KEY`: clave pública anon/publishable. Está diseñada para estar en el navegador; la seguridad real depende de RLS y las funciones SQL.
