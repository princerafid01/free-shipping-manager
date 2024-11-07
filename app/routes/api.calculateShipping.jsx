import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const { items } = await request.json();

  // Fetch product metafields for all items in cart
  const productIds = items.map(item => item.product_id);
  const productsData = await Promise.all(
    productIds.map(id =>
      admin.graphql(`
        query {
          product(id: "${id}") {
            metafields(namespace: "shipping") {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      `)
    )
  );

  // Process products data to determine shipping
  const productsWithShipping = productsData.map(async (response) => {
    const data = await response.json();
    const metafields = data.data.product.metafields.edges;
    return {
      hasShippingCharge: metafields.find(
        edge => edge.node.key === "has_shipping_charge"
      )?.node.value === "true",
      shippingFee: parseFloat(
        metafields.find(
          edge => edge.node.key === "shipping_fee"
        )?.node.value || "0"
      ),
    };
  });

  const products = await Promise.all(productsWithShipping);
  const requiresShipping = products.some(p => p.hasShippingCharge);

  if (!requiresShipping) {
    return json({
      rates: [{
        service_name: "Free Shipping",
        service_code: "FREE_SHIPPING",
        total_price: "0",
        currency: "USD",
      }],
    });
  }

  const totalShipping = products
    .filter(p => p.hasShippingCharge)
    .reduce((sum, p) => sum + p.shippingFee, 0);

  return json({
    rates: [{
      service_name: "Standard Shipping",
      service_code: "STANDARD_SHIPPING",
      total_price: (totalShipping * 100).toString(),
      currency: "USD",
    }],
  });
};
