# Plan — Landing pública y Base de conocimientos

> Plan aparte del [plan principal](./PLAN.md). **Estado: 🔄 primera versión construida sobre `DESIGN.md` (2026-10-19); pendiente de revisión del equipo de diseño.**
> No se construye frontend de este plan hasta recibir instrucciones explícitas.

**Última actualización:** 2026-10-19

## 1. Objetivo

1. **Landing pública:** explicar en segundos qué es Deal Terminal, para quién es y cómo funciona, con un concepto
   minimalista.
2. **Base de conocimientos:** documentación pública, estructurada y con búsqueda, con todo lo necesario para
   entender el producto y **construir sobre él** (agentes, MCP, API, autorizaciones, pagos).

El diseño visual (identidad, branding kit) lo define el equipo de diseño; aquí se implementa sobre ese sistema con
máxima fidelidad.

## 2. Insumos que necesitamos del equipo de diseño

| #   | Insumo                                                                                                    | Formato preferido                            | Estado |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------ |
| D1  | Logotipo y variantes (horizontal, símbolo, monocromo, claro/oscuro)                                       | SVG                                          | ⬜     |
| D2  | Paleta con roles (fondo, superficie, texto, acento, estados ok/aviso/error/info) para tema claro y oscuro | Tokens (JSON / Figma variables)              | ⬜     |
| D3  | Tipografías (títulos, texto, código) y escala tipográfica                                                 | Archivos de fuente con licencia web + escala | ⬜     |
| D4  | Espaciado, radios, sombras, rejilla y breakpoints                                                         | Tokens                                       | ⬜     |
| D5  | Iconografía                                                                                               | SVG (set o librería indicada)                | ⬜     |
| D6  | Diseños de la landing (desktop, tablet, móvil)                                                            | Figma                                        | ⬜     |
| D7  | Diseños de la Base de conocimientos: portada, artículo, búsqueda, navegación                              | Figma                                        | ⬜     |
| D8  | Ilustraciones o imágenes (si las hay) y diagramas del flujo                                               | SVG / WebP                                   | ⬜     |
| D9  | Tono de voz y textos de la landing (o validación de los que propongamos)                                  | Documento                                    | ⬜     |
| D10 | Favicon, imagen para compartir en redes (Open Graph)                                                      | SVG/PNG                                      | ⬜     |

## 3. Arquitectura propuesta (a confirmar)

| Tema               | Propuesta                                                                                        | Motivo                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Rutas              | Landing en `/`, Base de conocimientos en `/docs`, portal movido a `/app`                         | URL limpia para el público; el portal sigue igual bajo su prefijo           |
| Contenido          | Artículos en Markdown dentro del repositorio (`docs/kb/**`), versionados con el código           | Un solo origen de verdad; revisable en cada commit                          |
| Contenido generado | Catálogo de herramientas MCP, errores y estados generados desde el código (como `pnpm docs:mcp`) | Nunca se desincroniza                                                       |
| Búsqueda           | Índice generado en el build y búsqueda en el navegador, sin servicio externo                     | Rápida, privada y sin costes; funciona con el despliegue de un solo proceso |
| SEO y rendimiento  | Pre-renderizado estático de landing y artículos en el build                                      | Indexable y carga instantánea; sin servidor adicional                       |
| Sistema de diseño  | Tokens del kit de marca como variables CSS compartidas por landing, docs y portal                | Coherencia visual en todo el producto                                       |
| Despliegue         | Dentro del mismo `pnpm build` / `pnpm start`                                                     | Se mantiene el contrato de despliegue                                       |

## 4. Arquitectura de información de la Base de conocimientos (borrador)

1. **Empezar**
   - Qué es Deal Terminal · Cómo funciona en 2 minutos · Glosario
   - Empezar como comprador · Empezar como proveedor
2. **Conceptos**
   - Organizaciones, personas y agentes
   - Niveles de acceso: solo búsqueda, solo negociación, autonomía total
   - Autorización comercial y autorización financiera
   - Presupuesto delegado: por encargo, mensual, reservas y consumo
   - Catálogo, ofertas, tramos de precio y existencias
   - Negociación: versiones, reglas del proveedor, respuestas automáticas y excepciones
   - Pedidos: aceptación, reservas, estados comercial / financiero / entrega
   - Pagos con PayPal: checkout, pago delegado, reembolsos y conciliación
   - Trazabilidad y auditoría
3. **Construir con agentes (MCP)**
   - Qué es MCP y cómo lo usa Deal Terminal
   - Conectar Claude Code · Conectar Codex · Conectar con el SDK oficial · Otros clientes
   - Flujo recomendado del agente comprador · Flujo del agente proveedor
   - Buenas prácticas para prompts y manejo de errores
   - Catálogo de herramientas (generado)
4. **API REST**
   - Autenticación (sesión del portal y credenciales de agente) · Idempotencia (`Idempotency-Key`)
   - Referencia OpenAPI · Errores accionables (generado) · Estados (generado)
   - Webhooks de PayPal
5. **Seguridad y confianza**
   - Cómo se verifican los permisos en cada operación · Aislamiento entre organizaciones
   - Manejo de credenciales y secretos · Límites y revocación
6. **Operación**
   - Despliegue (VPS) · Configuración · Datos de demostración
7. **Preguntas frecuentes** · **Novedades**

## 5. Estructura de la landing (borrador, sujeto al diseño)

1. Hero: propuesta de valor en una frase ("Delega compras completas a tu agente, con límites verificables").
2. Cómo funciona en 3–4 pasos (necesidad → búsqueda → negociación → compra autorizada).
3. Los tres niveles de acceso.
4. Para compradores · Para proveedores · Para desarrolladores (MCP / API).
5. Confianza: autorizaciones verificadas por el servidor, presupuesto, trazabilidad, PayPal.
6. Llamadas a la acción: crear cuenta, leer la documentación, conectar un agente.

## 6. Etapas

| #   | Etapa                                                                   | Resultado verificable                                                                 | Estado |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| L0  | Recepción del kit y decisiones abiertas (§8)                            | Insumos D1–D10 y decisiones confirmadas                                               | ✅     |
| L1  | Sistema de diseño en código                                             | Tokens, tipografías, componentes base; página de muestra validada por diseño          | ✅     |
| L2  | Reestructura de rutas (`/`, `/knowledge`, `/console`, según DESIGN §10) | Portal funcionando en `/app`; retornos de PayPal actualizados; tests en verde         | ✅     |
| L3  | Landing                                                                 | Fiel a los diseños en desktop, tablet y móvil; solo tema oscuro (decisión 2026-10-20) | ✅     |
| L4  | Motor de la Base de conocimientos                                       | Markdown → páginas, navegación lateral, tabla de contenidos, enlaces entre artículos  | ✅     |
| L5  | Búsqueda                                                                | Índice en build, búsqueda instantánea con resaltado y navegación por teclado          | ✅     |
| L6  | Contenido                                                               | Artículos de §4 redactados y revisados; secciones generadas desde el código           | ✅     |
| L7  | Calidad y pulido                                                        | Criterios de §7 cumplidos y revisión final con el equipo de diseño                    | 🔄     |
| L8  | Consola con la identidad del sitio                                      | ConsoleShell (DESIGN §15), tokens compartidos, textos en inglés, móvil con drawer     | ✅     |

## 7. Criterios de calidad

- Fidelidad visual a los diseños aprobados, revisada por el equipo de diseño en cada etapa visual.
- Accesibilidad WCAG 2.2 AA: contraste, foco visible, navegación completa por teclado, textos alternativos.
- Responsive desde 320 px; sin desplazamiento horizontal.
- Rendimiento: Lighthouse ≥ 95 en rendimiento, accesibilidad, buenas prácticas y SEO para landing y artículos.
- Solo tema oscuro (fondo `#151a18`), por decisión del responsable de producto del 2026-10-20. Contrastes verificados: texto ≥ 4.5:1 y controles ≥ 3:1.
- Contenido técnico verificado contra el código (los ejemplos de MCP y API se prueban).

## 8. Decisiones abiertas

| #    | Tema                               | Propuesta por defecto                                                          |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------ |
| L-P1 | Idiomas de landing y documentación | Español; inglés como segunda fase (los jueces del hackatón pueden necesitarlo) |
| L-P2 | Rutas definitivas                  | `/`, `/docs`, `/app`                                                           |
| L-P3 | Formato de entrega de diseño       | Figma con variables (tokens exportables)                                       |
| L-P4 | Analítica web                      | Ninguna en el MVP (sin cookies de terceros)                                    |
| L-P5 | Llamada a la acción principal      | Crear cuenta de empresa                                                        |

## 9. Bitácora

- **2026-10-19** — Plan creado. En espera del kit de marca y los diseños del equipo de diseño.
- **2026-10-19** — Recibido `DESIGN.md` con logo, icono y mockup. Construidos landing (`/`), Knowledge (`/knowledge`, 13 artículos en inglés, búsqueda) y acceso (`/login`, `/register`) sobre los tokens del kit; consola movida a `/console`. Revisión con capturas a 375/768/1024/1440 px y auditoría de Web Interface Guidelines. Pendiente: revisión del equipo de diseño, consola con la nueva identidad y en inglés, versión vectorial del logo.
- **2026-10-20** — Reskin a **dark mode only** (fondo `#151a18`) por decisión del responsable de producto: los tokens de `tokens.css` pasan a la paleta oscura, el primario es marfil sobre tinta y el esmeralda queda como acento. Variantes `*-inverse` del logo y del símbolo derivadas de los archivos aprobados (solo cambia la tinta a marfil; pendiente de validar por diseño), favicon en tesela tinta. Corregido el logo y el símbolo duplicados en la cabecera de Knowledge. Consola rediseñada sobre los mismos tokens y tipografías (barra lateral con marca, organización, badge Sandbox, migas, drawer en móvil, badges con icono) y traducida al inglés (Codex, revisado). Pendiente: mensajes de error del servidor y datos de demo en inglés.
