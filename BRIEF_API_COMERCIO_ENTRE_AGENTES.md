# Brief de desarrollo del MVP de Deal Terminal
## Marketplace B2B para agentes de IA con negociación y compras autorizadas

**Empresa encargada del desarrollo de la propuesta:** Lucuo SRL · **Fecha:** 18 de octubre de 2026 · **Versión:** 2.0  
**Nombre comercial:** pendiente.  
**Entorno de demostración:** PayPal sandbox de Estados Unidos, moneda USD.  
**Objetivo:** desarrollar Deal Terminal, una API y un servidor MCP que permitan buscar, negociar y pagar según el nivel de autonomía que cada empresa conceda a su agente.
**Autonomia de el o los agentes encargados de desarrollar este proyecto:** El o los Agentes asignados a desarrollar este proyecto, tienen total autonomia para proponer mejoras que ayuden a mejorar sustancialmente este proyecto, sugerencias de tecnologia, sugerencia de menejo de conceptos y cualquier otro aporte que ayude a mejorar, ser mas efeciente, mas seguro, menos optimizacion, sin modificar la esencia del proyecto ni el proposito.

## 1. Concepto y propuesta de valor

Construir un marketplace B2B (o A2A?) diseñado para agentes de inteligencia artificial. Los participantes comerciales serán empresas compradoras de cualquier tamano (Micro, pequanas, medianas, grandes o multinacilaes) y proveedoras; sus agentes actuarán como representantes mediante herramientas autorizadas.

El comerciante expresará su necesidad en lenguaje natural a su agente habitual. El agente utilizará nuestra infraestructura para encontrar ofertas dentro del ecosistema de Deal Terminal, negociar y, cuando tenga autorización suficiente, completar una compra y su pago mediante PayPal sin solicitar otra confirmación por esa operación si tiene el nivel de permisos necesarios.

**Recien agregado, a considerar:** Por otro lado, el preveedor podra tambien establecer sus reglas sobre la cual el agende del comerciante puede negociar. El agente del proveedor tambien puede negociar con el agente del comerciante al recibir una solicitud. El agente del provedor no tiene que estar siempre conectado, la idea centrar es que el proveedor suba su inventario, precio por cantiad, y esas cosas. La idea del agente del proveedor es que, al recibir una oferta del agente del comerciante, pueda empezar una negociacion sobre las bases establecidas previamente por el humano.

**Propuesta de valor:** permitir a una empresa delegar compras completas a su agente, con límites verificables y control sobre el nivel de autonomía concedido.

Nuestra plataforma alojará el registro de participantes, productos, ofertas, solicitudes, negociaciones, permisos y pedidos. La API ejecutará las operaciones y el servidor MCP las expondrá a clientes compatibles. La visión es una red comercial compartida que distintas aplicaciones y agentes puedan utilizar.

El MVP incorporará los tres niveles de acceso desde el inicio. La autonomía de compra es una capacidad central, no una mejora opcional posterior.

## 2. Usuarios y ubicación de los datos

| Participante | Función | Información alojada en nuestra plataforma |
| --- | --- | --- |
| Empresa compradora | Define necesidades y delega facultades | Usuarios, agentes, permisos, solicitudes, presupuestos y compras |
| Empresa proveedora | Publica productos y condiciones de venta | Catálogo, ofertas, existencias informadas, cotizaciones y conexión de cobro |
| Desarrollador integrador | Conecta una aplicación o agente | Integración identificada y acceso autorizado por cada organización |
| Administrador de la empresa | Configura facultades y revisa operaciones | Políticas, autorizaciones, conexiones y actividad de su organización |
| Operador del servicio | Atiende incidencias técnicas | Trazas y estados bajo permisos operativos específicos |

Una empresa puede comprar y vender. Los agentes se ejecutan fuera de nuestra plataforma y se conectan en nombre de una organización identificada. Las ofertas publicadas son consultables según su visibilidad; los límites privados, métodos de pago e historial de una empresa no se comparten con otras.

La interfaz humana será un portal mínimo de alta, configuración de permisos, conexión financiera y revisión. El recorrido comercial principal se realizará mediante agentes.

## 3. Tres niveles de acceso del agente comprador

| Nivel visible para el usuario | Buscar y comparar | Solicitar y negociar cotizaciones | Aceptar el acuerdo y pagar |
| --- | --- | --- | --- |
| **Solo búsqueda** | Sí | No | No |
| **Solo negociación** | Sí | Sí, dentro de las instrucciones | El comerciante revisa, acepta y procesa el pago manualmente |
| **Autonomía total** | Sí | Sí, dentro de sus facultades | El agente acepta y ejecuta el pago dentro de una autorización vigente |

“Autonomía total” significa ejecutar todo el encargo sin intervención adicional cuando cumple las condiciones autorizadas. Sigue estando limitada por producto, presupuesto, vigencia, proveedores y demás restricciones definidas por el dueño.

En solo búsqueda se permiten consultas y guardar una necesidad privada para repetir la búsqueda. No se permite contactar proveedores mediante solicitudes de cotización, realizar contrapropuestas, reservar productos, aceptar acuerdos ni pagar.

En solo negociación, el agente deja una propuesta final pendiente de revisión. No crea compromisos vinculantes ni utiliza un método de pago guardado. El propietario acepta desde el portal y completa el checkout PayPal.

En autonomía total, el servidor verifica la delegación antes de aceptar el acuerdo y nuevamente antes de iniciar el pago. Si falta autoridad, el proceso queda pendiente de decisión del dueño.

Los niveles se asignan por agente y organización. No se deducen de lo que el modelo diga en una conversación. Los permisos del proveedor para publicar, cotizar y aceptar condiciones de venta se administran por separado.

## 4. Autorización comercial y autorización financiera

Se requieren dos autorizaciones independientes para pagar sin intervención del dueño:

| Autorización | Qué permite | Dónde se verifica |
| --- | --- | --- |
| Comercial | Define qué puede comprar el agente y bajo qué límites | Motor de permisos de nuestra plataforma |
| Financiera | Permite utilizar un medio de pago para operaciones futuras bajo el consentimiento concedido | Integración PayPal y estado del token o acuerdo |

Iniciar sesión en PayPal o identificar una cuenta no concede, por sí solo, permiso para realizar cargos futuros. El dueño debe completar el flujo específico de consentimiento financiero. Tener un medio de pago guardado tampoco concede autoridad comercial al agente.

**Registro de autorización de compra:** organización, propietario que la concede, agente, nivel, encargo, atributos obligatorios, cantidades, proveedores permitidos, presupuesto total, moneda, dirección y plazo de entrega, expiración, estado y versión.

Cada encargo tendrá un máximo acumulado, contando todos sus pedidos e intentos financieros pendientes. Podrán añadirse un límite por operación y un presupuesto mensual compartido por los agentes de la empresa. El MVP implementará el presupuesto por encargo y un límite mensual de organización, con periodos definidos en UTC.

Los permisos y límites se crean, amplían o revocan desde una sesión autenticada del administrador. Un agente puede solicitar cambios para revisión, pero no aprobarlos ni aumentar sus propios límites. Las restricciones obligatorias que no puedan comprobarse impiden la aceptación automática.

## 5. Caso de uso inicial

**Categoría:** envases para alimentos. Atributos estructurados: material, capacidad, aptitud para comida caliente, tapa y presentación. Operaciones en USD con comprador y dos proveedores sandbox de Estados Unidos.

**Encargo:** «Compra 300 envases con tapa para comida caliente, sin foam. Entrega antes del viernes en esta dirección. Puedes negociar y pagar hasta US$80, incluyendo transporte e impuestos».

El administrador selecciona el nivel correspondiente y confirma las condiciones estructuradas del encargo. En autonomía total, también debe existir una autorización financiera activa.

**Flujo común:**

1. El agente interpreta la petición y completa los datos requeridos, aclarando ambigüedades con el dueño.
2. La herramienta registra la necesidad y encuentra ofertas compatibles.
3. Devuelve alternativas con total, condiciones y campos pendientes, sin presentar datos desconocidos como confirmados.
4. Según el nivel, el agente se detiene con resultados o solicita cotizaciones y contrapropone condiciones.
5. El proveedor responde mediante su agente o reglas comerciales previamente autorizadas.
6. La propuesta final fija cantidad, producto, total, destino, entrega, vigencia y proveedor.
7. En solo negociación, el dueño revisa, acepta y paga. En autonomía total, el agente solicita la aceptación y compra; el servidor comprueba permisos, reserva recursos y procesa el pago autorizado.
8. El servidor confirma el estado financiero con PayPal y notifica el resultado a las partes.

Una compra contiene un proveedor seleccionado y un pedido. La entrega física se representa mediante estados de demostración identificados; el dinero utilizado es ficticio de sandbox.

## 6. Arquitectura y función de la IA

| Componente | Responsabilidad |
| --- | --- |
| API comercial | Gestionar organizaciones, catálogo, solicitudes, cotizaciones y pedidos |
| Servidor MCP | Exponer herramientas estructuradas y autenticar el acceso de agentes |
| Motor de búsqueda y reglas | Comparar atributos, calcular importes y aplicar condiciones |
| Motor de autorizaciones | Comprobar niveles, delegaciones, presupuesto, revocación y vigencia |
| Integración PayPal | Conectar proveedores, guardar medios autorizados, cobrar y reconciliar |
| Base de datos | Mantener estados, versiones, reservas de stock y presupuesto |
| Procesador de tareas y webhooks | Resolver operaciones asíncronas, reintentos y notificaciones |
| Portal y consola | Alta, permisos, conexión PayPal, revisión manual y trazabilidad |

**IA en el MVP:** los modelos de los clientes interpretan las instrucciones, seleccionan herramientas, comparan resultados y formulan propuestas. La API recibe atributos y condiciones estructurados. El servidor utiliza algoritmos y reglas deterministas para búsqueda, validación, autorización y pagos.

**No se incorpora un modelo de IA interno en esta versión.** La interpretación semántica de catálogos libres y documentos se evaluará después. Los proveedores del MVP publican productos con atributos normalizados, y las explicaciones de compatibilidad del servidor se basan en reglas verificadas.

El servidor MCP y la API compartirán servicios de negocio. MCP puede invocar esas funciones directamente; no se duplicará el motor comercial. La conexión MCP no ejecuta ni hospeda por sí misma al agente: el cliente mantiene el modelo y su ciclo de herramientas. Una acción pendiente puede retomarse por consulta de estado.

**Stack recomendado:** Nestjs, TypeScript, Postgress, OpenAPI, SDK oficial de MCP y React para el portal mínimo. Las versiones y el cliente MCP de referencia se fijarán al comenzar el desarrollo.

## 7. Alcance del MVP

### Incluido

- Registro de organizaciones, propietarios y agentes, con separación de datos y roles de comprador y proveedor.
- Tres niveles de acceso, creación de autorizaciones, cambio de nivel y revocación.
- Catálogo normalizado, ofertas, existencias informadas y condiciones de dos proveedores de prueba.
- Búsqueda por atributos, presupuesto, zona y fecha; comparación de totales y datos faltantes.
- Solicitud de cotización, contrapropuesta y respuesta con historial de versiones.
- Límites del proveedor para precio, cantidad y entrega; aprobación de excepciones.
- Aceptación manual o delegada según nivel y facultades.
- Reserva de stock y presupuesto antes de ejecutar la compra.
- Checkout manual para solo negociación.
- Consentimiento inicial PayPal, tokenización y pago posterior sin checkout por compra en autonomía total cuando la operación esté habilitada.
- Estados pendientes de acción humana cuando el permiso o PayPal lo requieran.
- Verificación de pagos, webhooks, reconciliación y reembolso sandbox.
- Portal de configuración y revisión, consola de actividad y notificaciones dentro del producto.
- MCP autenticado, documentación, datos de prueba y demo reproducible desde un agente externo.

### Fuera del MVP

Compras colectivas, múltiples monedas, dinero real, logística real, ERP, crédito, depósitos en garantía, compras simultáneas a varios proveedores en un mismo pedido, IA interna, importación de catálogos sin estructurar y ejecución permanente de agentes alojados por nosotros.

El diseño deja preparada la evolución a compras colectivas. La primera versión concentra su diferenciación en la delegación verificable y la ejecución del pago.

## 8. Integración PayPal sandbox de Estados Unidos

Se configurarán una cuenta de plataforma, una cuenta compradora y dos cuentas proveedoras de prueba de Estados Unidos. El alcance no incluye el análisis ni la habilitación de países en producción.

**Proveedor:** completa el flujo sandbox de conexión y permisos para recibir pagos mediante la plataforma. El servidor registra su identificador PayPal y consulta que esté habilitado para cobrar.

**Comprador con pago manual:** acepta las condiciones en el portal, aprueba el checkout PayPal y el servidor confirma la operación con el beneficiario e importe correctos.

**Comprador con autonomía total:** completa una vez el flujo sandbox de aprobación de un acuerdo y guardado del medio de pago para futuras compras. El servidor obtiene un token persistente válido y lo vincula a la organización. Se utilizará la modalidad de guardado a nivel de plataforma para compras a los proveedores participantes cuando esté configurada y disponible.

Una vez activados el permiso comercial y la autorización financiera, el servidor podrá crear y capturar una compra utilizando el token, sin entregar ese token al modelo. Los pagos se dirigirán al proveedor identificado en el pedido.

El sistema almacenará únicamente referencias y secretos necesarios en el servidor. La contraseña PayPal del comprador no se almacena. Un token temporal de configuración aprobado no se tratará como un token de pago listo para utilizar: se completará y verificará su conversión y estado.

**Estados de conexión financiera:** no conectada, configuración pendiente, activa, revocada o requiere atención. Seleccionar autonomía total antes de completar PayPal dejará deshabilitada la ejecución financiera automática.

**Primera validación técnica obligatoria:** completar en sandbox el consentimiento inicial y un pago posterior a un proveedor sin nueva aprobación de checkout; verificar también el alcance del token para el segundo proveedor. Este recorrido debe funcionar antes de desarrollar el resto de la experiencia. Si aparece un requisito de configuración, se resolverá en la integración sandbox; no se reemplazará la capacidad central por un pago simulado o exclusivamente manual.

Una petición adicional de autenticación o un rechazo de PayPal se devolverá como estado explícito. La compra se reanudará cuando proceda o finalizará como fallida, sin garantizar que toda transacción pueda ejecutarse sin intervención.

## 9. Herramientas MCP propuestas (El agente asiganado al desarrollo puede proponer mas herramientas si lo considera)

Nombres orientativos. Los permisos se aplican en el servidor tanto para MCP como para llamadas directas a la API.

| Herramienta | Propósito | Acceso comprador |
| --- | --- | --- |
| `create_request` | Guardar la necesidad privada sin contactar proveedores | Los tres niveles |
| `find_matches` | Buscar y comparar ofertas publicadas | Los tres niveles |
| `get_request` | Consultar una solicitud propia | Los tres niveles |
| `request_quote` | Enviar una solicitud de cotización | Negociación o autonomía total |
| `counter_quote` | Proponer cambios de condiciones | Negociación o autonomía total |
| `get_quotes` | Consultar propuestas de una negociación propia | Según participación autorizada |
| `accept_quote` | Fijar condiciones y crear un pedido | Autonomía total con delegación suficiente |
| `execute_purchase` | Aceptar o recuperar el pedido y ejecutar su pago autorizado | Autonomía total con consentimiento financiero activo |
| `get_order` | Consultar estado comercial y financiero | Participante autorizado |
| `get_authorization_status` | Consultar alcance y estado del permiso, sin secretos | Agente autorizado |
| `cancel_order` | Solicitar cancelación antes del pago | Según facultades y estado |
| `request_refund` | Solicitar revisión de una devolución | Según facultades |

`execute_purchase` será idempotente: si un pedido ya fue aceptado o tiene un pago en curso, lo reutiliza y devuelve su estado. No generará un segundo pedido o cobro por reintento. Si el agente utiliza primero `accept_quote`, la ejecución posterior se vincula al mismo pedido.

Las herramientas de proveedor serán `publish_offer`, `update_offer`, `submit_quote` y `respond_to_counterquote`, sujetas a permisos de venta. La aprobación de reembolsos requerirá una facultad específica del proveedor.

La aceptación manual y el checkout estarán disponibles para el propietario en el portal. No se expondrán como una vía para que un agente de solo negociación se salte su nivel. El agente tampoco podrá habilitar su propio consentimiento financiero.

## 10. Reglas de negociación, autoridad y presupuesto

Las condiciones obligatorias se representan en campos estructurados. Un atributo ambiguo o desconocido requiere aclaración antes de la compra automática. Las preferencias pueden influir en la selección del agente, pero no reemplazan restricciones obligatorias.

Las ofertas son persistentes: un proveedor no necesita mantener su agente conectado para que se consulten. La negociación puede resolverse con sus reglas autorizadas o quedar pendiente de respuesta. Ningún agente puede conceder un descuento fuera de su autoridad.

Al aceptar y al despachar el pago, el servidor comprueba organización, agente, nivel actual, autorización vigente, versión de cotización, proveedor, atributos, cantidad, moneda, total, destino, plazo y conexión financiera.

Los cálculos utilizan precisión decimal. Transporte e impuestos informados forman parte del total autorizado. El MVP toma esos valores de la cotización del proveedor; no implementa un motor fiscal. Los presupuestos son límites de gasto delegados, no una afirmación sobre el saldo bancario de la empresa.

La reserva de presupuesto se hará de forma transaccional y se aplicará tanto al encargo como al límite mensual. Dos agentes concurrentes no podrán gastar el mismo presupuesto disponible. Los pagos pendientes o de resultado incierto conservan su reserva hasta reconciliación.

Un fallo definitivo libera la reserva. Un pago confirmado registra gasto consumido. Un reembolso confirmado se registra por separado y no aumenta automáticamente el presupuesto delegado. Las cancelaciones pendientes o devoluciones solicitadas no se tratan como dinero ya recuperado.

La revocación o reducción de nivel bloquea nuevas aceptaciones y pagos aún no despachados. Las solicitudes financieras ya enviadas se reconcilian; un pago capturado requiere el proceso de devolución correspondiente. Cambiar permisos no revierte por sí solo una operación en curso.

## 11. Datos, estados y trazabilidad

**Entidades:** organización, usuario, agente, concesión de acceso, autorización de compra versionada, conexión PayPal, producto, oferta, solicitud, cotización versionada, pedido, reserva de stock, reserva de presupuesto, intento de pago, reembolso y evento de auditoría.

Cada cotización incluye producto y atributos confirmados, cantidad y unidad, precios, descuentos, transporte, impuestos, total, moneda, proveedor, dirección o zona, fecha de entrega y expiración.

| Objeto | Estados principales |
| --- | --- |
| Autorización comercial | Pendiente, activa, revocada, expirada o agotada |
| Solicitud | Abierta, cerrada, cancelada o expirada |
| Cotización | Propuesta, reemplazada, aceptada, rechazada o expirada |
| Pedido | Pendiente de revisión, pendiente de pago, pagado, cancelado o expirado |
| Pago | Creado, procesando, requiere acción, completado, fallido o resultado por reconciliar |
| Reembolso | Solicitado, autorizado, procesando, completado o fallido |

Los estados comerciales, financieros y de entrega son independientes. Un pago tardío tras vencer la reserva de stock se marca como incidencia y se resuelve expresamente; no se asume disponibilidad ni entrega.

La auditoría enlaza propietario que delegó, agente que actuó, política y cotización aplicadas, validaciones, pedido y referencias PayPal. Debe poder responder: qué se autorizó, quién actuó, por qué se permitió y qué ocurrió con el pago.

## 12. Fiabilidad y seguridad funcional

- Permisos verificados por operación y recurso, con aislamiento entre organizaciones.
- Autenticación MCP mediante un mecanismo estándar compatible con el SDK y el cliente de referencia. Los secretos de conexión pertenecen al software cliente, no a las instrucciones visibles del modelo.
- Credenciales financieras y tokens protegidos en el servidor, fuera de respuestas MCP, registros públicos y repositorio.
- Idempotencia para escrituras, aceptación, creación de pedido, pago y reembolso.
- Control de concurrencia en stock, presupuestos y transición a pago en ejecución.
- Verificación de webhooks PayPal y tolerancia a duplicados y eventos fuera de orden.
- Consulta del estado financiero antes de repetir una operación de resultado desconocido.
- Cotización y política versionadas; un cambio de condiciones no modifica un pedido ya aceptado sin nueva aceptación válida.
- Catálogos, ofertas y mensajes tratados como datos, sin autoridad para ampliar permisos ni modificar reglas.
- Errores accionables: nivel insuficiente, permiso revocado, presupuesto agotado, atributo sin confirmar, cotización vencida, stock insuficiente o acción PayPal requerida.

## 13. Experiencia de configuración

El propietario registra su empresa, conecta un agente y selecciona su nivel. Define límites y condiciones mediante un formulario sencillo y puede revisar la actividad de su organización.

Si elige autonomía total, el portal muestra el estado de las dos autorizaciones y le guía para completar la configuración PayPal. Solo se indica que el agente está listo para comprar cuando ambas están activas.

Las condiciones sugeridas desde lenguaje natural deben mostrarse estructuradas al propietario antes de activar la delegación. Los cambios posteriores de presupuesto, agente o facultades requieren una sesión autorizada del dueño.

En solo negociación, el portal muestra la propuesta final con todos sus costes y permite aceptarla y pagar. En solo búsqueda, el agente entrega opciones y cualquier paso comercial posterior exige intervención o cambio explícito de nivel.

## 14. Demo y entregables del hackatón

**Recorrido principal:** tras mostrar el consentimiento inicial ya configurado, el dueño encarga los 300 envases. Su agente busca, negocia un ajuste autorizado, acepta la propuesta y ejecuta un pago PayPal sandbox sin otro checkout. La consola muestra el acuerdo, permiso aplicado, presupuesto y referencia financiera confirmada.

**Recorridos complementarios:** un agente de solo búsqueda queda bloqueado al intentar negociar; uno de solo negociación obtiene una cotización que el dueño paga manualmente; un intento que supera presupuesto o utiliza un permiso revocado se rechaza antes de cobrar.

**Entregables:** repositorio público con licencia de código abierto; README y variables de entorno; datos y cuentas de prueba; OpenAPI; catálogo de herramientas MCP; especificación comercial y de autorizaciones v0.2; guía de conexión del cliente MCP; portal y consola; demo reproducible; instrucciones para jueces; video público de YouTube de menos de tres minutos; explicación del papel de los modelos de los agentes y PayPal.

El flujo inicial de consentimiento se documentará para que pueda reproducirse. Los jueces podrán utilizar cuentas sandbox proporcionadas por un canal apropiado. No se publicarán secretos financieros o claves de modelos.

## 15. Criterios de aceptación

1. Un cliente MCP externo ejecuta el recorrido con un modelo real y herramientas reales.
2. El catálogo, las solicitudes y el historial persisten entre sesiones de agentes.
3. Solo búsqueda permite consultar y bloquea negociar, aceptar, reservar y pagar.
4. Solo negociación permite solicitar cotizaciones y realizar contrapropuestas, pero exige que el propietario acepte y pague.
5. Autonomía total completa negociación, aceptación y pago sandbox dentro de la autorización, sin nuevo checkout por esa compra en el recorrido habilitado.
6. Seleccionar autonomía total sin consentimiento PayPal activo bloquea el cobro automático.
7. Se rechazan intentos con permiso revocado, expirado, nivel reducido o condiciones obligatorias sin confirmar.
8. El agente no puede ampliar sus límites ni modificar los del proveedor.
9. El total y el beneficiario enviados a PayPal coinciden con el acuerdo aceptado.
10. Las cotizaciones vencidas, reemplazadas o sin disponibilidad no se aceptan automáticamente.
11. Dos compras concurrentes que juntas superen el presupuesto no pueden cobrarse ambas por superar una misma reserva disponible.
12. Reintentar la aceptación o compra no duplica pedidos ni cobros.
13. Los resultados financieros desconocidos mantienen presupuesto reservado hasta reconciliarse.
14. Una devolución sandbox confirmada queda vinculada al pago y registrada sin restaurar automáticamente la delegación de gasto.
15. La revocación impide nuevos pagos y los ya despachados conservan un estado reconciliable.
16. Se verifica el aislamiento entre organizaciones y la ausencia de tokens financieros en las respuestas al agente.
17. Se demuestra pago manual, pago delegado, bloqueo por límite, revocación y webhook repetido.
18. Un tercero reproduce los recorridos con la documentación y las cuentas de prueba.

## 16. Plan de implementación

| Fase | Resultado verificable |
| --- | --- |
| 1. Prueba de viabilidad financiera | Consentimiento sandbox, token válido, pago posterior sin nuevo checkout y comprobación del alcance entre dos proveedores |
| 2. Identidad y delegación | Empresas, agentes, tres niveles, autorizaciones, revocación y presupuestos |
| 3. Mercado y negociación | Catálogo, solicitudes, búsqueda estructurada, cotizaciones y contrapropuestas |
| 4. Compra ejecutable | Aceptación, reservas, pago manual y delegado, webhooks y recuperación de incidencias |
| 5. Integración y experiencia | MCP, portal de configuración, revisión manual, consola y documentación |
| 6. Verificación y entrega | Criterios de aceptación, datos de prueba, demo y video |

La primera fase valida la dependencia técnica principal; las demás se construyen sobre ese recorrido confirmado. No se fija en este brief un presupuesto ni un calendario contractual.

## 17. Evolución posterior

Compras colectivas y descuentos por volumen compartido; reposición recurrente; nuevas categorías; solicitudes visibles entre integraciones con consentimiento; logística y ERP; IA interna solo si demuestra una mejora frente al catálogo estructurado.

La expansión conservará el mismo principio: cada operación debe poder vincularse a una autorización vigente y a un acuerdo con condiciones comprobables.

## 18. Referencias oficiales

Documentación consultada el 18 de octubre de 2026. El desarrollo verificará el flujo concreto con las cuentas sandbox de Estados Unidos.

- [Reglas del PayPal AI Hackathon](https://paypalaihackathon.devpost.com/rules)
- [PayPal: plataforma para marketplaces](https://developer.paypal.com/platforms/overview)
- [PayPal: onboarding de proveedores](https://developer.paypal.com/platforms/seller-onboarding)
- [PayPal: guardar medios de pago](https://developer.paypal.com/platforms/checkout/save-payment-methods/)
- [PayPal: guardado a nivel de plataforma](https://developer.paypal.com/platforms/checkout/save-payment-methods/onboarding/platform/)
- [PayPal: consentimiento, token y pagos futuros](https://developer.paypal.com/platforms/checkout/save-payment-methods/purchase-later/payment-tokens-api/paypal/)
- [PayPal: servidor MCP](https://developer.paypal.com/ai-tools/mcp-server)
