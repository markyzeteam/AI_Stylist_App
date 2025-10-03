import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>YZE AI Shopping Stylist</h1>
        <p className={styles.text}>
          Personalized fashion recommendations powered by AI body shape analysis. Help your customers find their perfect fit.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>AI Body Shape Analysis</strong>. Advanced algorithm identifies customer body shapes with high accuracy for precise recommendations.
          </li>
          <li>
            <strong>Smart Product Matching</strong>. Automatically recommends products from your catalog that complement each body type.
          </li>
          <li>
            <strong>Personalized Size Guidance</strong>. Provides specific sizing advice to reduce returns and increase customer satisfaction.
          </li>
        </ul>
      </div>
    </div>
  );
}
