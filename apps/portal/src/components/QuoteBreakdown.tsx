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
            {quote.quantity} {quote.unit === 'unit' ? 'units' : quote.unit} ×{' '}
            <Money value={quote.listUnitPrice} /> (list price)
          </td>
          <td className="num">
            <Money value={quote.subtotal} />
          </td>
        </tr>
        {quote.discountTotal !== '0.00' && (
          <tr>
            <td>
              Negotiated discount (unit price <Money value={quote.unitPrice} />)
            </td>
            <td className="num">
              −<Money value={quote.discountTotal} />
            </td>
          </tr>
        )}
        <tr>
          <td>Shipping</td>
          <td className="num">
            <Money value={quote.shipping} />
          </td>
        </tr>
        <tr>
          <td>Taxes</td>
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
            Deliver by {formatDate(quote.deliverBy)} to {a.line1}, {a.city}, {a.state}{' '}
            {a.postalCode}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
