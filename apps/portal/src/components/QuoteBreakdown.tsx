import type { QuoteView } from '../types';
import { formatDate, Money } from './ui';

/** Desglose completo de una cotización: todos los costes antes de aceptar (brief §13). */
export function QuoteBreakdown({
  quote,
}: {
  quote: Pick<
    QuoteView,
    | 'quantity'
    | 'unit'
    | 'listUnitPrice'
    | 'unitPrice'
    | 'subtotal'
    | 'discountTotal'
    | 'shipping'
    | 'tax'
    | 'total'
    | 'currency'
    | 'deliverBy'
    | 'deliveryAddress'
  >;
}) {
  const a = quote.deliveryAddress;
  return (
    <table>
      <tbody>
        <tr>
          <td>
            {quote.quantity} {quote.unit === 'unit' ? 'unidades' : quote.unit} ×{' '}
            <Money value={quote.listUnitPrice} /> (lista)
          </td>
          <td className="num">
            <Money value={quote.subtotal} />
          </td>
        </tr>
        {quote.discountTotal !== '0.00' && (
          <tr>
            <td>
              Descuento negociado (precio unitario <Money value={quote.unitPrice} />)
            </td>
            <td className="num">
              −<Money value={quote.discountTotal} />
            </td>
          </tr>
        )}
        <tr>
          <td>Transporte</td>
          <td className="num">
            <Money value={quote.shipping} />
          </td>
        </tr>
        <tr>
          <td>Impuestos</td>
          <td className="num">
            <Money value={quote.tax} />
          </td>
        </tr>
        <tr>
          <th>Total</th>
          <th className="num">
            <Money value={quote.total} currency={quote.currency} />
          </th>
        </tr>
        <tr>
          <td colSpan={2} className="muted">
            Entrega antes del {formatDate(quote.deliverBy)} en {a.line1}, {a.city}, {a.state}{' '}
            {a.postalCode}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
