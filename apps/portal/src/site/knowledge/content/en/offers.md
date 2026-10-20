Use products and offers to describe what you sell, calculate quantity prices and set the limits your sales agent can use.

## Products and normalized attributes

A product contains a supplier SKU, name, optional description, category, attributes and unit. The SKU must be unique within the supplier organization. The unit defaults to `unit`. An offer adds the commercial conditions for that product.

The current category is `food_containers` (Food containers). Product attributes must match its schema; unknown attribute keys are rejected.

| Attribute        | Required | Allowed values                                                                |
| ---------------- | -------- | ----------------------------------------------------------------------------- |
| `material`       | Yes      | `paper`, `kraft_paper`, `bagasse`, `pla`, `pp`, `pet`, `aluminum`, `foam_eps` |
| `capacity_oz`    | Yes      | Number greater than 0, up to 256                                              |
| `hot_food_safe`  | Yes      | Boolean                                                                       |
| `microwave_safe` | No       | Boolean                                                                       |
| `has_lid`        | Yes      | Boolean                                                                       |
| `compartments`   | No       | Integer from 1 to 8                                                           |
| `pack_size`      | Yes      | Positive integer: units per package                                           |

An omitted optional attribute is unknown. If a buyer requires it, the search result needs confirmation; omission never means the requirement is satisfied. Buyers express constraints with `eq`, `in`, `not_in`, `min`, `max`, or a combined `min` and `max`.

## Offer conditions

| Field              | Meaning and limits                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `status`           | Create as `draft` (Draft, default) or `active` (Active). A status update can activate, pause or archive the offer. |
| `stockAvailable`   | Reported stock, a nonnegative integer. Search availability subtracts active reservations.                          |
| `minOrderQty`      | Positive minimum order quantity; defaults to 1.                                                                    |
| `maxOrderQty`      | Optional positive maximum, at least the minimum.                                                                   |
| `shipRegions`      | Nonempty list of distinct supported US state codes, including `DC`.                                                |
| `leadTimeDays`     | Standard lead time, 0–60 calendar days. Date calculations use UTC.                                                 |
| `shippingFlat`     | Flat shipping charge as a decimal string; defaults to `"0.00"`.                                                    |
| `taxRate`          | Decimal fraction from `"0"` to `"0.25"`, up to four decimal places; defaults to zero.                              |
| `validUntil`       | Optional expiry timestamp with a timezone offset.                                                                  |
| `priceTiers`       | One to ten quantity thresholds and unit prices.                                                                    |
| `negotiationRules` | Private limits for automatic replies and supplier agents.                                                          |

Offer statuses also include `paused` (Paused) and `archived` (Archived). Search returns active offers whose expiry has not passed, excludes the buyer's own organization, and normally excludes incompatible results. Archived offers cannot be changed.

## Prices by quantity

Each tier has a positive integer `minQty` and a positive `unitPrice` string with up to four decimal places. The applicable tier has the largest threshold no greater than the requested quantity. Thresholds must be distinct, the first must cover the minimum order, and prices cannot increase at higher thresholds.

For example, the demo seed includes these tiers:

| Minimum quantity | Unit price |
| ---------------- | ---------: |
| 50               |      $0.31 |
| 250              |      $0.24 |
| 1,000            |      $0.22 |

For 300 units, the list price is $0.24. The pricing breakdown records the list subtotal, discount, shipping, tax and total. Tax applies to merchandise after discount plus shipping. Totals use two decimal places.

> **Note:** Tax is supplied by the seller for this sandbox demonstration. Deal Terminal does not implement a tax determination service.

## Private negotiation rules

| Field                | Meaning                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `autoRespond`        | Reply through the rules engine without a connected supplier agent; defaults to `true`. If false, requests wait for the supplier. |
| `maxDiscount`        | Maximum discount fraction against the applicable tier, from zero to 0.5, with up to four decimal places; defaults to zero.       |
| `floorUnitPrice`     | Required positive price floor. It cannot exceed any tier price.                                                                  |
| `minQtyForDiscount`  | Positive quantity at which negotiated discounts become available; defaults to 1. Below it, the minimum is the tier price.        |
| `minLeadTimeDays`    | Minimum delivery lead time, 0–60 days, no greater than the standard lead time.                                                   |
| `canWaiveShipping`   | Whether shipping can be waived; defaults to `false`.                                                                             |
| `quoteValidityHours` | Quote lifetime, 1–720 hours; defaults to 48. Offer expiry can shorten it.                                                        |

See [negotiation](/knowledge/negotiation) for how these rules produce a reply.

## Publishing, versions and visibility

An agent needs the `publish_offers` seller scope to create products, publish offers, update conditions or list its private offers. An owner or administrator can perform these operations through a console session. Buyer access levels do not grant seller scopes.

Offers start at version 1. Replacing conditions increments the version and replaces tiers and rules. A changed status also increments it; repeating the same status does not. Quotes store the offer version and product snapshot used to create them. Accepted [orders](/knowledge/orders) freeze their terms.

Buyers can see supplier identity, product details, tiers, calculated costs, delivery information, available stock, order limits and compatibility results. They cannot retrieve private negotiation rules or supplier rule traces. Supplier views include those private fields. A result above budget can still appear with `budget.withinBudget=false`; it is an opportunity to negotiate, not permission to buy.
