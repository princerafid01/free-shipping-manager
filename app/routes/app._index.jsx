import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Card,
  Layout,
  Page,
  DataTable,
  LegacyCard,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch all products with their metafields
  const products = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            metafields(first: 2, namespace: "shipping") {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `);

  const productsData = await products.json();

  return json({
    products: productsData.data.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      hasShippingCharge: node.metafields.edges.find(
        edge => edge.node.key === "has_shipping_charge"
      )?.node.value === "true",
      shippingFee: parseFloat(
        node.metafields.edges.find(
          edge => edge.node.key === "shipping_fee"
        )?.node.value || "0"
      ),
    })),
  });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId");
  const hasShippingCharge = formData.get("hasShippingCharge") === "true";
  const shippingFee = formData.get("shippingFee");

  // Update product metafields
  await admin.graphql(`
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace: "shipping",
          key: "has_shipping_charge",
          value: String(hasShippingCharge),
          type: "boolean",
        },
        {
          ownerId: productId,
          namespace: "shipping",
          key: "shipping_fee",
          value: String(shippingFee),
          type: "number_decimal",
        },
      ],
    },
  });

  return null;
};

export default function Index() {
  const { products } = useLoaderData();
  const submit = useSubmit();

  const rows = products.map((product, index) => [
    product.title,
    <input
    key={index}
      type="checkbox"
      checked={product.hasShippingCharge}
      onChange={(e) => {
        const formData = new FormData();
        formData.append("productId", product.id);
        formData.append("hasShippingCharge", String(e.target.checked));
        formData.append("shippingFee", product.shippingFee.toString());
        submit(formData, { method: "post" });
      }}
    />,
    <input
      key={index}
      type="number"
      step="0.01"
      value={product.shippingFee}
      disabled={!product.hasShippingCharge}
      onChange={(e) => {
        const formData = new FormData();
        formData.append("productId", product.id);
        formData.append("hasShippingCharge", String(product.hasShippingCharge));
        formData.append("shippingFee", e.target.value);
        submit(formData, { method: "post" });
      }}
    />,
  ]);

  return (
    <Page title="Product Shipping Settings">
      <Layout>
        <Layout.Section>
          <LegacyCard>
            <DataTable
              columnContentTypes={["text", "text", "numeric"]}
              headings={["Product", "Requires Shipping", "Shipping Fee"]}
              rows={rows}
            />
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
