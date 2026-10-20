# Deal Terminal — DESIGN.md

**Versión:** 1.0 · **Fecha:** 19 de octubre de 2026  
**Uso:** guía normativa para el modelo de IA y el equipo que implementen la UI/UX del MVP.  
**Idioma de esta guía:** español. **Idioma inicial del producto:** inglés, preparado para traducción.

## 0. Instrucción inicial para el modelo implementador

Construye Deal Terminal como una infraestructura comercial B2B para agentes de IA. La interfaz permite a las empresas conectar agentes, definir sus facultades, publicar ofertas, revisar negociaciones y seguir compras y pagos. Los agentes realizan el trabajo comercial mediante API y MCP; la persona configura y supervisa.

La dirección aprobada combina marfil cálido, negro tinta, verde esmeralda, tipografía contundente y composición editorial con mucho espacio. Lenguaje abstracto y minimalista: tarjetas de solicitudes, cotizaciones, condiciones y pedidos, conectadas mediante líneas discretas. El logo vigente es el carrito formado por signos de programación `< >`.

No utilices fotografías realistas de cajas, envases, vasos, paquetes ni otros productos. No generes nuevas fotografías para llenar tarjetas. Representa el comercio mediante información, iconos lineales e ilustraciones geométricas planas.

Usa este documento para tomar decisiones visuales y de interacción. El brief define el alcance y las reglas de negocio; ante un conflicto funcional, respeta el brief y los permisos del servidor. Los mockups son referencias estéticas: sus importes, textos pequeños y configuraciones de ejemplo no constituyen contratos técnicos.

## 1. Identidad de marca

| Elemento          | Definición                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Nombre            | **Deal Terminal**, siempre dos palabras y capitalización de título                               |
| Categoría         | Marketplace B2B diseñado para agentes de inteligencia artificial                                 |
| Propuesta         | Los agentes encuentran proveedores, negocian y ejecutan compras dentro de la autoridad concedida |
| Descriptor        | **Commerce between AI agents.**                                                                  |
| Frase de proceso  | **Search. Negotiate. Transact.**                                                                 |
| Personalidad      | Precisa, competente, serena, contemporánea y orientada a negocios                                |
| Sensación buscada | Claridad para delegar y visibilidad sobre cada acuerdo                                           |

La idea visual central es un acuerdo que avanza: solicitud → oferta → condiciones → pedido → pago. La tecnología explica cómo se conectan los agentes, pero el contenido comercial explica para qué sirve el producto.

### Principios obligatorios

1. **La compra debe entenderse.** Mostrar producto, cantidad, proveedor, total y condiciones con claridad.
2. **La autoridad debe verse.** Nivel del agente, límites y estado de las autorizaciones son información de primer orden.
3. **Los estados deben ser honestos.** Un pago pendiente nunca aparece como completado; un agente conectado no implica permiso para pagar.
4. **La tipografía construye la jerarquía.** Evitar decoraciones que compitan con titulares, importes y decisiones.
5. **La interfaz debe respirar.** Agrupar por propósito y separar grupos con espacio y reglas finas.
6. **El comercio se representa de forma abstracta.** Ofertas, etiquetas, documentos, recibos y símbolos planos; sin fotografía de productos.

## 2. Referencias y precedencia visual

| Referencia                                     | Qué conservar                                                      | Qué descartar                                           |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| Primer branding kit                            | Paleta, personalidad, composición, tipografías y motivos lineales  |  Símbolo geométrico antiguo                             |
| Primera landing abstracta                      | Hero tipográfico y flujo de tarjetas de solicitud, oferta y pedido | Logo antiguo, cifras o etiquetas incorrectas del mockup |
| Logo e icono del carrito `< >`                 | Geometría, proporciones y combinación de tinta y esmeralda         | Ningún rediseño adicional                               |
| Propuestas posteriores con productos realistas | Solo ideas funcionales útiles, como permisos y seguimiento         | Todas las fotografías y objetos fotorrealistas          |

**Orden de decisión:** correcciones explícitas del usuario → reglas funcionales del brief → este documento → referencias de imagen. Una imagen nunca justifica omitir un estado o cambiar un permiso.

No mezclar varias direcciones estéticas. La versión base del frontend es clara. Las secciones oscuras de marketing son superficies puntuales; no obligan a desarrollar un tema oscuro completo de la consola.

## 3. Logo, símbolo y archivos

El símbolo vigente integra el carrito, su asa y dos ruedas con los signos `< >`: parte izquierda en tinta y derecha esmeralda. El wordmark es **Deal Terminal** en negro tinta junto al símbolo.

- Utilizar los archivos aprobados. No sustituir el símbolo por un carrito de una librería ni reconstruirlo con caracteres tipográficos.
- Conservar proporción de aspecto. No estirar, inclinar, girar, añadir sombras ni modificar sus espacios internos.
- Área de protección mínima: 25% de la altura del símbolo alrededor del conjunto.
- Altura habitual del símbolo: 28–32 px en cabecera de consola; 32–40 px en marketing. El wordmark acompaña según su proporción natural.
- En espacios menores de 120 px de ancho, utilizar solo el símbolo. No reducir todo el wordmark hasta hacerlo ilegible.
- Para un favicon, partir del símbolo; comprobar su lectura a 16, 24 y 32 px. La versión monocroma solo se prepara si hace falta y conserva la geometría.
- Sobre tinta, usar la variante aprobada con trazos oscuros convertidos a marfil y esmeralda conservado. No aplicar `invert()` a toda la imagen. Si no existe el archivo inverso, utilizar el logo original sobre una superficie marfil.
- El enlace del logo lleva nombre accesible `Deal Terminal — Home`. El símbolo junto a texto redundante puede ser decorativo.
- El wordmark nunca se utiliza como icono funcional para pagar, revocar o confirmar.

### Manifiesto de integración

Rutas recomendadas para el proyecto; el implementador debe importar los archivos aprobados a estas rutas antes de referenciarlos. No se afirma que estas rutas ya existan.

| Ruta prevista            | Contenido                                           |
| ------------------------ | --------------------------------------------------- |
| `deal-terminal-logo.png` | Logo horizontal aprobado sobre transparencia        |
| `deal-terminal-icon.png` | Símbolo carrito/código aprobado sobre transparencia |

Refencias visuales

propuesta_landing_page.png

Los PNG actuales son assets de marca, no fuentes tipográficas editables. No presentar un PNG como SVG. Una futura versión vectorial debe conservar el diseño aprobado.

## 4. Tokens de color y superficies

Estos son los valores base. Usar variables semánticas en los componentes en lugar de repetir hexadecimales.

| Token de marca | Valor     | Función                                               |
| -------------- | --------- | ----------------------------------------------------- |
| Ivory          | `#F5F3EC` | Fondo principal                                       |
| Ink            | `#151A18` | Texto principal, CTA principal y secciones oscuras    |
| Emerald        | `#00B77A` | Identidad, acentos y superficies de acción destacadas |
| Sage           | `#DFE9E2` | Paneles tranquilos, selección y fondos abstractos     |

```css
:root {
  color-scheme: light;
  /* Brand primitives */
  --dt-ivory: #f5f3ec;
  --dt-ink: #151a18;
  --dt-emerald: #00b77a;
  --dt-sage: #dfe9e2;

  /* Surfaces */
  --bg-page: var(--dt-ivory);
  --bg-surface: #ffffff;
  --bg-subtle: #ecefe9;
  --bg-selected: var(--dt-sage);
  --bg-inverse: var(--dt-ink);
  --bg-overlay: rgb(21 26 24 / 42%);

  /* Text */
  --text-primary: var(--dt-ink);
  --text-secondary: #4d5b53;
  --text-muted: #626d66;
  --text-inverse: var(--dt-ivory);
  --text-inverse-muted: #c0ccc4;
  --text-link: #007a52;

  /* Actions */
  --action-primary: var(--dt-ink);
  --action-primary-hover: #29342e;
  --action-primary-text: var(--dt-ivory);
  --action-accent: var(--dt-emerald);
  --action-accent-hover: #00a66f;
  --action-accent-text: var(--dt-ink);
  --action-disabled: #e2e6e0;
  --action-disabled-text: #717b74;

  /* Borders: quiet rules versus interactive boundaries */
  --border-subtle: #d8ded8;
  --border-control: #7b8880;
  --border-active: #007a52;
  --focus-ring: #007a52;

  /* Semantic feedback: foregrounds on matching backgrounds */
  --success-fg: #006342;
  --success-bg: #e1f3e9;
  --warning-fg: #805300;
  --warning-bg: #fff0cc;
  --danger-fg: #a52b35;
  --danger-bg: #fdebed;
  --info-fg: #245578;
  --info-bg: #e6f0f7;
}

[data-surface='dark'] {
  --bg-page: #151a18;
  --bg-surface: #202923;
  --bg-subtle: #28342d;
  --text-primary: #f5f3ec;
  --text-secondary: #c0ccc4;
  --text-muted: #a8b8ad;
  --text-link: #41d9a4;
  --border-subtle: #45534a;
  --border-control: #7e9185;
  --border-active: #41d9a4;
  --focus-ring: #41d9a4;
  --action-primary: #00b77a;
  --action-primary-hover: #20c78f;
  --action-primary-text: #151a18;
}
```

### Reglas de uso

- La mayor parte de la pantalla usa neutros. El verde destaca decisiones, selección, progreso y marca.
- Sobre el esmeralda vivo, usar texto tinta. **No usar texto blanco pequeño sobre `#00B77A`.**
- Para enlaces y texto verde sobre marfil, usar `--text-link`, no el esmeralda vivo.
- `--border-subtle` sirve para divisores y tarjetas no interactivas. Los límites necesarios para reconocer controles utilizan `--border-control` o una solución de contraste equivalente verificada.
- Un estado siempre combina etiqueta, símbolo y color. Un punto verde solo no comunica qué está activo.
- “Full autonomy” no es un estado de éxito: su selección se distingue por borde, radio y texto, no por una aprobación verde automática.
- PayPal conserva su identidad oficial dentro del componente correspondiente. El azul no se convierte en un segundo color de marca.

## 5. Tipografía

| Uso                    | Familia       | Peso    | Tamaño / interlineado               |
| ---------------------- | ------------- | ------- | ----------------------------------- |
| Hero desktop           | Space Grotesk | 700     | `clamp(44px, 5.4vw, 80px)` / `0.99` |
| Hero móvil             | Space Grotesk | 700     | 40–48 px / `1.04`                   |
| Título de página       | Space Grotesk | 600–700 | 32–40 px / `1.12`                   |
| Título de sección      | Space Grotesk | 600     | 24–32 px / `1.2`                    |
| Título de tarjeta      | Space Grotesk | 600     | 18–20 px / `1.3`                    |
| Texto de interfaz      | Space Grotesk | 400–500 | 14–16 px / `1.5`                    |
| Prosa de documentación | Space Grotesk | 400     | 16–18 px / `1.65`                   |
| Metadata y código      | IBM Plex Mono | 400–500 | 12–14 px / `1.5`                    |
| Importe principal      | Space Grotesk | 600     | 28–40 px / `1.1`                    |

```css
:root {
  --font-sans: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --tracking-display: -0.045em;
  --tracking-heading: -0.025em;
  --tracking-label: 0.12em;
}
```

Autoalojar las fuentes autorizadas y usar `font-display: swap`. No esperar a una descarga externa para mostrar contenido. Monoespaciada para identificadores, etiquetas breves, metadatos y ejemplos; evitar párrafos enteros pequeños en mono. No usar mayúsculas sostenidas en instrucciones largas. Los importes usan cifras tabulares y no saltan de ancho al actualizarse.

## 6. Espaciado, geometría, elevación y movimiento

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --radius-sm: 4px;
  --radius-control: 6px;
  --radius-card: 10px;
  --radius-panel: 14px;
  --radius-pill: 999px;
  --shadow-card: 0 4px 16px rgb(21 26 24 / 4%);
  --shadow-float: 0 16px 40px rgb(21 26 24 / 10%);
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --z-base: 0;
  --z-sticky: 20;
  --z-menu: 40;
  --z-overlay: 60;
  --z-dialog: 70;
  --z-toast: 80;
}
```

Tarjetas con borde de 1 px, relleno de 20–24 px y radio de 10 px. No convertir todas las superficies en tarjetas; usar secciones abiertas y divisores. Los pills se reservan para badges, filtros compactos y avatares.

Las sombras comunican superposición y son discretas. No aplicar sombra flotante a cada fila. Motion: cambios de color y opacidad, apertura breve de panel y progreso verificable. Sin escritura automática ornamental, pulsos infinitos, parallax, confeti ni animaciones que simulen una compra. Respetar `prefers-reduced-motion`; la información permanece disponible sin movimiento.

## 7. Composición y responsive

| Superficie  | Regla                                                                                |
| ----------- | ------------------------------------------------------------------------------------ |
| Marketing   | Contenedor máximo 1280 px; márgenes laterales 24–48 px; secciones separadas 80–96 px |
| Consola     | Sidebar de 232–248 px; contenido de ancho flexible hasta 1440 px; padding 24–32 px   |
| Knowledge   | Navegación 240 px, artículo 640–760 px, índice 160–180 px; gaps 32 px                |
| Formularios | Columna de lectura de 560–720 px; resumen lateral opcional                           |

Breakpoints orientativos: móvil `<768 px`, tablet `768–1023 px`, escritorio `≥1024 px`, pantalla amplia `≥1440 px`.

- A 375 px no existe scroll horizontal de la página. Tablas y código pueden desplazarse dentro de un contenedor identificado.
- Hero: dos columnas aproximadamente 52/48 en escritorio; texto, CTA y visual en ese orden en móvil.
- Las tres tarjetas de permisos se apilan en móvil sin cambiar su orden.
- Sidebar de consola pasa a menú accesible en tablet/móvil. El selector de organización permanece localizable.
- Knowledge convierte navegación en drawer y el índice en “On this page” desplegable. El contenido principal conserva prioridad.
- Los resúmenes financieros laterales pasan debajo del encabezado del pedido antes de la actividad secundaria.
- Cabeceras sticky nunca ocultan los destinos de enlaces internos ni el foco del teclado.

## 8. Lenguaje visual e ilustraciones

Usar SVG o CSS para ilustraciones abstractas de interfaz, con 2–4 tarjetas, líneas finas y pequeños conectores. Evitar bitmaps decorativos para elementos que pueden dibujarse con código. Esto no autoriza a redibujar el logo aprobado.

Motivos permitidos: hoja con solicitud, etiqueta de precio, documento de cotización, pequeño edificio de proveedor, caja lineal plana, recibo, carrito/código, check y enlace. La caja lineal funciona como pictograma; no debe tener textura, fotografía ni iluminación realista.

Iconografía: una sola familia lineal, trazos consistentes de aproximadamente 1.75–2 px a 24 px; tamaños funcionales 16, 20 y 24 px. Decorativos de 40–56 px. No mezclar emojis, iconos rellenos, 3D y lineales en la misma jerarquía.

No utilizar robots como protagonista, cerebros, circuitos, partículas, monedas flotantes, gráficos bursátiles, gradientes violeta/azul, neón, glassmorphism ni decoraciones de consola hacker. La palabra Terminal no convierte el producto en una terminal de trading.

## 9. Prosa, voz y microcopy

Escribir de forma breve, directa y específica. Explicar qué hará el agente y bajo qué condiciones. No atribuir al sistema resultados que no estén confirmados.

| Contexto             | Usar                                                                                | Evitar                                          |
| -------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| Encabezado principal | `Your agent. Your terms. Business done.`                                            | Promesas de ahorro garantizado                  |
| Explicación          | `Find suppliers, negotiate offers and purchase within your authorized limits.`      | Frases vagas sobre revolucionar el futuro       |
| CTA de marketing     | `Connect your agent`                                                                | `Start the revolution`                          |
| Negociación manual   | `Review offer` / `Approve and pay`                                                  | `Done` antes del pago                           |
| Configuración        | `Save permissions`                                                                  | `Activate full access` sin condiciones visibles |
| Límite excedido      | `This order exceeds the authorized budget by $4.00.`                                | `Something went wrong`                          |
| Estado incierto      | `We’re confirming the payment. Don’t submit it again.`                              | `Payment failed` sin confirmación               |
| Revocación           | `New purchases will be blocked. Payments already processing will still be checked.` | `All transactions have been cancelled`          |

### Diccionario del producto

| Inglés visible         | Español                   | Significado                                    |
| ---------------------- | ------------------------- | ---------------------------------------------- |
| Search only            | Solo búsqueda             | Buscar y comparar                              |
| Negotiate only         | Solo negociación          | Negociar; el dueño acepta y paga               |
| Full autonomy          | Autonomía total           | Comprar dentro de una autorización vigente     |
| Purchase authorization | Autorización de compra    | Alcance comercial delegado                     |
| PayPal consent         | Consentimiento de PayPal  | Consentimiento financiero para compras futuras |
| Authorized budget      | Presupuesto autorizado    | Tope delegado, no saldo bancario               |
| Committed              | Comprometido              | Gasto reservado para operaciones pendientes    |
| Spent                  | Gastado                   | Gasto confirmado                               |
| Available to authorize | Disponible para autorizar | Presupuesto menos comprometido y gastado       |

“Full autonomy” siempre lleva cerca `Within your authorized limits.`. “Connected” solo describe conexión; nunca lo usar como sinónimo de “Ready to purchase”.

Los párrafos de marketing se limitan a 1–3 frases y el texto explicativo de una tarjeta a 2–3 líneas. Documentación puede ser más extensa: abrir con el objetivo, seguir con requisitos y pasos, cerrar con resultado esperado y recuperación de errores.

El contenido se gestiona con claves traducibles. Formatear dinero y fechas con el locale activo. Para la demo usar USD y `en-US`; mostrar fechas completas cuando una abreviatura pueda ser ambigua. Los periodos de presupuesto se identifican como UTC y las fechas operativas muestran su zona.

## 10. Arquitectura de información

| Área           | Rutas orientativas                                                     | Propósito                                       |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Marketing      | `/`                                                                    | Explicar y llevar a conexión o documentación    |
| Knowledge      | `/knowledge`, `/knowledge/getting-started`, `/knowledge/access-levels` | Aprender a integrar y operar                    |
| Consola        | `/console`                                                             | Resumen de trabajo y pendientes                 |
| Agentes        | `/console/agents`, `/console/agents/:id`                               | Conexiones, nivel y facultades                  |
| Autorizaciones | `/console/authorizations`, `/console/authorizations/:id`               | Condiciones, presupuesto, vigencia y revocación |
| Operaciones    | `/console/requests`, `/console/negotiations`, `/console/orders/:id`    | Seguimiento y revisión                          |
| Pagos          | `/console/payments`, `/console/settings/payments`                      | Estado, conexión PayPal y devoluciones          |
| Proveedores    | `/console/offers`, `/console/quotes`                                   | Publicar condiciones y responder propuestas     |

Una organización puede comprar y vender: presentar sus capacidades en la navegación sin obligarla a crear dos cuentas. Ocultar funciones ajenas a su rol sin depender de esa ocultación como control de autorización.

Un explorador de ofertas puede existir como vista de consulta, pero no añadir un carrito convencional de checkout ni un chatbot propio como recorrido principal. El MVP no aloja modelos de IA internos ni agentes permanentes.

## 11. Landing page aprobada

1. **Cabecera:** logo vigente; `How it works`, `For suppliers`, `Knowledge`; CTA `Connect agent`. Borde inferior fino; sin barra de anuncios innecesaria.
2. **Hero:** eyebrow `B2B MARKETPLACE FOR AI AGENTS`; titular principal aprobado; párrafo de valor; CTA tinta `Connect your agent` y secundario `Explore the docs`.
3. **Visual del hero:** panel sage con tarjetas marfil: solicitud de 300 envases, oferta de proveedor y pedido con pago confirmado. Conectores esmeralda y badges explicativos. Pictogramas lineales; cero fotos.
4. **Proceso:** tres bloques `Find the right offer`, `Negotiate the terms`, `Complete the purchase`, con símbolos planos y textos breves.
5. **Permisos:** `Choose how much your agent can do.` y las tres tarjetas con diferencias visibles; mostrar autonomía como opción, sin activarla por defecto.
6. **Valor bilateral:** dos bloques editoriales `For buyers` / `For suppliers`, con ejemplos abstractos de solicitud y oferta. No inventar reseñas ni sellos de proveedor verificado.
7. **CTA final oscuro:** `Built for agents. Controlled by you.` y CTA esmeralda con texto tinta.
8. **Footer:** logo, descriptor y enlaces disponibles. No incluir enlaces vacíos ni cuentas de redes ficticias.

El visual de marketing es ilustrativo y no debe parecer una compra real del visitante. Mostrar `Illustrative sandbox workflow` cerca del ejemplo cuando presente pagos. No simular que una animación ha conectado su agente o cobrado.

## 12. Knowledge y documentación

Estructura: cabecera con logo, buscador y acceso a consola; navegación izquierda; artículo central; índice derecho en escritorio. No transformar Knowledge en una cuadrícula de artículos genéricos de blog.

Secciones: `Start here`, `Agent access`, `Commerce`, `Developers`. Entradas iniciales: introducción, conexión del primer agente, niveles, ofertas, negociación, pedidos, PayPal, herramientas MCP, API y webhooks.

El artículo de conexión muestra: objetivo → requisitos → tres pasos → ejemplo validado para el cliente elegido → resultado esperado → errores. Un callout explica las dos autorizaciones necesarias para pagar automáticamente.

`CodeBlock` usa fondo tinta, texto legible, scroll propio y botón Copy con confirmación `Copied`. No imprimir claves reales. No inventar un paquete npm, dominio o comando como si ya estuviera publicado. Los placeholders deben identificarse y los ejemplos ejecutables validarse con la implementación existente.

Buscador funcional con resultados por título y contenido, estado vacío y acceso mediante teclado. Si la búsqueda aún no existe, no presentar una caja que simule resultados.

## 13. Consola, permisos y conexión de PayPal

La consola responde primero: qué necesita revisión, qué está en curso y qué puede hacer cada agente. Un resumen útil puede mostrar solicitudes abiertas, negociaciones y pedidos, con datos reales o fixtures identificados.

### Configurar un agente

Mostrar nombre, organización, conexión, nivel y última actividad. El estado online no equivale a una autorización activa. Permitir elegir un nivel mediante `RadioGroup` con tarjetas enteras seleccionables y navegación por teclado.

| Nivel          | Buscar | Negociar | Aceptar y pagar como agente     |
| -------------- | ------ | -------- | ------------------------------- |
| Search only    | Sí     | No       | No                              |
| Negotiate only | Sí     | Sí       | No                              |
| Full autonomy  | Sí     | Sí       | Sí, dentro de permisos vigentes |

No seleccionar Full autonomy por defecto en un alta. Un cambio aumenta facultades solo después de revisar y guardar desde una sesión autorizada del propietario. Habilitar un nivel no reemplaza el consentimiento financiero.

### Crear una autorización

Formulario con: agente, encargo, producto y atributos obligatorios, cantidad, proveedores permitidos, máximo total con transporte e impuestos, moneda, destino, entrega y expiración. Resumen de condiciones antes de guardar. Mostrar el límite mensual de organización y su periodo si aplica.

La pantalla de autonomía presenta **dos estados independientes**: `Purchase authorization` y `PayPal consent`. Hasta que ambos sean válidos, mostrar `Setup incomplete` o el impedimento concreto, con el siguiente paso.

El flujo PayPal abre la experiencia oficial y muestra al regresar un estado de verificación del servidor. No pedir contraseña PayPal en formularios propios. No marcar “Active” basándose solo en parámetros del redirect. No diseñar una pantalla ficticia que imite el login oficial.

Revocar acceso requiere un diálogo breve con agente, alcance y efecto. `Cancel` no cambia nada; `Revoke access` confirma. Evitar escribir “se cancelarán todos los pagos”: las operaciones en curso pueden requerir reconciliación. Mantener el historial visible.

## 14. Negociaciones, pedidos y pagos

`QuoteComparison` presenta producto, proveedor, cantidad, coste unitario, descuentos, transporte, impuestos, total, moneda, fecha, vigencia y cumplimiento. Alinear importes a la derecha; dejar claro qué valores están pendientes de confirmar. No inventar puntuaciones como “99% match” sin una definición real.

“Lowest total” requiere comparación completa; “Best match” requiere criterios explicados. Una oferta que supera el presupuesto puede aparecer como alternativa, con aviso, pero nunca como compra automáticamente autorizada.

En solo negociación el propietario revisa la versión final y usa `Approve and pay`; el agente no ve esa acción como capacidad propia. En autonomía el propietario puede supervisar la actividad sin que la interfaz añada confirmaciones obligatorias a cada operación autorizada.

Detalle de pedido: identidad y estado → acuerdo aceptado y proveedor → resumen económico → permisos aplicados → pago y referencias → actividad. Usar documentos o pictogramas para el producto. Las notas de negociación son secundarias frente a las condiciones finales.

### Estados y tratamiento

| Estado                          | Apariencia                      | Acción o texto útil                                             |
| ------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| Pending review                  | Neutral con icono de documento  | `Review offer`                                                  |
| Negotiating                     | Info                            | `View negotiation`                                              |
| Processing payment              | Info con progreso indeterminado | `We’re confirming the payment.`                                 |
| Requires action                 | Warning                         | `Continue in PayPal` cuando exista acción válida                |
| Payment completed               | Success                         | Referencia y recibo de pago                                     |
| Payment failed                  | Danger                          | Motivo confirmado y recuperación admitida                       |
| Payment unconfirmed             | Warning                         | Conservar estado y esperar consulta; no ofrecer cobro duplicado |
| Authorization revoked / expired | Neutral con icono apropiado     | Mostrar impedimento y revisión del dueño                        |
| Refund requested                | Warning                         | Solicitud pendiente, dinero no recuperado                       |
| Refunded                        | Neutral o success contextual    | Importe y referencia de devolución confirmada                   |

Pago, pedido y entrega tienen estados separados. “Payment completed” no implica “Delivered”. La conexión PayPal activa no garantiza saldo ni aceptación de todos los cargos.

## 15. Biblioteca de componentes

Cada componente debe usar tokens, semántica HTML y estados compartidos. Evitar variantes locales duplicadas.

| Componente                        | Contrato visual y de comportamiento                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `BrandLockup`                     | Logo aprobado; variante normal/inversa; ratio y texto accesible                                             |
| `MarketingHeader`                 | Navegación breve y una acción principal; menú móvil accesible                                               |
| `ConsoleShell`                    | Sidebar, organización, breadcrumbs, cuenta y badge de entorno                                               |
| `Button`                          | Primary tinta, accent esmeralda, secondary borde, ghost y destructive; alturas 44 px normal, 36 px compacta |
| `TextLink`                        | Color semántico; subrayado en prosa; foco y hover visibles                                                  |
| `TextField`, `Select`, `TextArea` | Label persistente, ayuda, estado inválido y error asociado; altura de control 44 px                         |
| `MoneyField`                      | Moneda visible; validación decimal; desglose y límite sin ambigüedad                                        |
| `StatusBadge`                     | Label breve más icono; paleta semántica; no solo puntos de color                                            |
| `SurfaceCard`                     | Borde fino, radio de tarjeta, padding consistente; variantes default/subtle/selected                        |
| `PermissionLevelCard`             | Radio real, título, facultades y límites; selección explícita                                               |
| `AuthorizationSummary`            | Nivel, encargo, presupuesto, expiración y dos autorizaciones independientes                                 |
| `BudgetMeter`                     | Máximo, gastado, comprometido y disponible; leyenda textual y escala verificable                            |
| `RequestCard`                     | Producto por nombre y pictograma, cantidad, condiciones y estado                                            |
| `SupplierQuoteCard`               | Identidad, total, cumplimiento y vigencia; acción según permiso                                             |
| `QuoteComparison`                 | Tabla en desktop y tarjetas en móvil; la misma información y unidades                                       |
| `OrderSummary`                    | Cantidad, acuerdo, desglose, proveedor, destino y estados separados                                         |
| `ActivityTimeline`                | Eventos reales, actor, fecha y resultado; el check indica un evento completado                              |
| `PayPalConnectionCard`            | Estado verificado y acción disponible; identidad PayPal oficial                                             |
| `DataTable`                       | Headers semánticos, sorting real si se muestra, filas vacías, loading y paginación                          |
| `Tabs`                            | Secciones equivalentes, selección clara, teclado; no para pasos obligatorios                                |
| `ConfirmDialog`                   | Alcance, efecto, Cancel y acción concreta; foco atrapado y restaurado                                       |
| `Drawer`                          | Detalle breve o menú móvil; no ocultar un formulario largo sin espacio                                      |
| `Toast`                           | Resultado breve no crítico; no único lugar para errores de pago                                             |
| `InlineNotice`                    | Info, warning, error o éxito, con recuperación cuando corresponda                                           |
| `EmptyState`                      | Icono lineal, motivo y siguiente acción útil                                                                |
| `Skeleton`                        | Silueta del contenido esperado; no importes ficticios en espera                                             |
| `CodeBlock`, `DocsCallout`        | Ejemplos legibles, copy funcional y advertencias específicas                                                |

Todos los controles: default, hover, focus-visible, pressed cuando aplique, disabled y loading. No depender de hover para descubrir una acción importante. Un botón loading conserva ancho, anuncia progreso y evita doble envío sin impedir la lectura.

Los niveles de agentes no reemplazan los roles humanos. Un propietario puede configurar permisos; un agente de búsqueda no puede hacerlo. El frontend se guía por capacidades devueltas por el servidor, y el servidor vuelve a verificar cada operación.

## 16. Datos de ejemplo y coherencia económica

Usar un fixture único compartido por landing, consola y documentación visual cuando se refieran a la misma compra:

| Campo                     | Valor                                     |
| ------------------------- | ----------------------------------------- |
| Producto                  | Food containers with lids                 |
| Cantidad                  | 300 units                                 |
| Coste unitario            | $0.22                                     |
| Subtotal                  | $66.00                                    |
| Transporte                | $6.00                                     |
| Impuestos de demostración | $2.00                                     |
| Total                     | **$74.00 USD**                            |
| Presupuesto autorizado    | $80.00 USD                                |
| Proveedor                 | Container Supply Co. — ficticio de demo   |
| Entrega                   | Oct 23, 2026, con zona visible en detalle |

El impuesto del fixture es ilustrativo; no representa un cálculo fiscal real.

Antes de confirmar pago, si se reservan $74: gastado $0, comprometido $74, disponible $6. Después de completar: gastado $74, comprometido $0, disponible $6. Disponible = máximo − gastado − comprometido. No descontar dos veces el mismo pago.

No mostrar “300 × $0.25 = $74” ni mezclar presupuestos unitarios con máximos de pedido. No copiar errores numéricos de los mockups. Ofertas alternativas pueden ser $78 y $82; la segunda debe indicar que supera el máximo de $80.

Los fixtures se etiquetan `Demo data` y el entorno financiero `Sandbox`. No inventar testimonios, clientes, valor transaccionado, certificaciones, proveedores verificados ni porcentajes de ahorro.

## 17. Accesibilidad y estados completos

Objetivo de implementación: contraste de al menos 4.5:1 para texto normal y 3:1 para texto grande y señales de control relevantes; comprobar los pares finales, incluyendo hover y superficies oscuras. Esta guía no equivale a una certificación de accesibilidad.

- Foco visible de 2 px, offset de 3 px; nunca eliminar outline sin alternativa.
- Todas las acciones funcionan con teclado. Diálogos cierran con Escape cuando no comprometa una operación; devuelven el foco al disparador.
- Objetivos táctiles principales de al menos 44 × 44 px. Los iconos pequeños mantienen padding suficiente.
- Labels reales, errores asociados al campo y un resumen de errores cuando el formulario sea largo.
- Badges con texto. Selección radio con semántica nativa. No usar un switch para activar pagos sin mostrar sus condiciones.
- Imágenes decorativas con alt vacío; logo y gráficos con alternativas útiles. El flujo comercial se puede entender leyendo sus tarjetas en orden.
- Loading, empty, error, unauthorized, offline y success deben existir en cada pantalla de datos.
- Anunciar cambios importantes con regiones live apropiadas; no repetir anuncios en cada polling.
- Aumentar zoom al 200% sin perder acciones. Respetar movimiento reducido.

## 18. Reglas de implementación y conexión con datos

Implementar componentes reutilizables en React y TypeScript, con tokens CSS como fuente visual única. Mantener estilos de negocio y datos fuera del componente visual cuando corresponda. Usar el router y utilidades que ya existan en el proyecto; no introducir un segundo sistema sin necesidad.

La ausencia de backend no se disimula como éxito. Durante desarrollo, una capa de mocks explícita permite probar estados y acciones locales; ninguna acción local se presenta como pago real de sandbox. Al integrar, utilizar el contrato API existente y no inventar endpoints financieros o permisos nuevos.

Los importes se reciben del servidor y se formatean en la UI; la UI no es autoridad para habilitar gasto. No guardar tokens financieros ni secretos en el cliente. La URL de retorno PayPal inicia una comprobación, no una confirmación optimista.

No habilitar reintentos de pago cuando el resultado sea incierto. No restaurar presupuesto automáticamente por mostrar “Refund requested”. Respetar revisiones de política y manejar un rechazo de permisos aunque el botón estuviera habilitado al abrir la pantalla.

La actividad financiera se actualiza con estados confirmados. El presupuesto no salta artificialmente para hacer una animación atractiva. Evitar indicadores decorativos de conexión, barras y gráficas sin datos o significado.

## 19. Criterios de entrega visual y funcional

Antes de entregar la UI, comprobar:

- Logo y símbolo del carrito aprobados; ningún símbolo antiguo en cabeceras o footer.
- Cero fotografías realistas de productos en landing, consola y Knowledge.
- Paleta y tipografías consistentes, sin estilos genéricos añadidos a mitad del recorrido.
- Hero abstracto con solicitud, oferta y pedido; significado comercial reconocible.
- CTA principal claro, enlaces reales y búsqueda de documentación funcional o ausente.
- Los tres niveles comunican y respetan facultades diferentes. Full autonomy no aparece activo por defecto.
- Estado comercial y consentimiento PayPal visibles por separado.
- Bloqueo comprensible por presupuesto, expiración, revocación o acción requerida.
- Totales, unidades y presupuesto coherentes; fechas y zonas explícitas.
- Recorrido manual para negociar y pagar; seguimiento autónomo sin confirmaciones adicionales inventadas.
- Layout verificado a 375, 768, 1024 y 1440 px, con teclado y zoom.
- Estados loading, empty y error diseñados, incluidos pago incierto y devolución pendiente.
- La documentación no expone claves ni paquetes o endpoints inventados como definitivos.
- Todo dato ficticio o transacción de ejemplo está identificado como demostración.

## 20. Referencias de assets disponibles en esta sesión

Estos archivos son referencias de origen en el entorno de trabajo, no rutas públicas del frontend. Si se trabaja en otro entorno, deben adjuntarse o importarse los PNG correspondientes. Este documento es autocontenido para los tokens y las reglas; la reproducción exacta del logo requiere su asset.

| Referencia                             | Archivo de origen                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Primera identidad: estilo y paleta     | `/workspace/scratch/a635ce8bc51b/generated_images/exec-a5a17086-0809-4b2c-966f-d00505e44a04.png` |
| Primera landing abstracta: composición | `/workspace/scratch/a635ce8bc51b/generated_images/exec-551cb85f-7150-4453-9fd0-1e0e30814841.png` |
| Icono vigente: carrito + código        | `/workspace/scratch/a635ce8bc51b/generated_images/exec-166c17c1-1ffc-4972-a232-0c8ae8a0c3c5.png` |
| Logo horizontal vigente                | `/workspace/scratch/a635ce8bc51b/generated_images/exec-5fec43b6-0d34-4e35-858b-824ed2038fd2.png` |

**Instrucción final:** conserva la serenidad editorial de la primera propuesta, utiliza el nuevo logo y representa el comercio con acuerdos, condiciones y documentos. Haz que la autoridad del agente y el estado real de cada operación sean fáciles de comprender.
