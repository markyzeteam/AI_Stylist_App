// Mapping body shapes to suitable clothing categories and styles for storefront
export const BODY_SHAPE_PREFERENCES = {
  "Pear/Triangle": {
    favorable: ["tops", "blouses", "jackets", "blazers", "statement-sleeves"],
    keywords: ["a-line", "fit-and-flare", "empire-waist", "bootcut", "wide-leg", "structured-shoulders"]
  },
  "Apple/Round": {
    favorable: ["dresses", "tunics", "flowing-tops", "v-necks"],
    keywords: ["empire-waist", "v-neck", "scoop-neck", "high-waisted", "flowing", "wrap"]
  },
  "Hourglass": {
    favorable: ["fitted-dresses", "wrap-dresses", "belted-items", "high-waisted"],
    keywords: ["fitted", "wrap", "belted", "high-waisted", "curve-hugging", "bodycon"]
  },
  "Inverted Triangle": {
    favorable: ["bottoms", "skirts", "wide-leg-pants", "a-line"],
    keywords: ["a-line", "wide-leg", "bootcut", "scoop-neck", "v-neck", "minimize-shoulders"]
  },
  "Rectangle/Straight": {
    favorable: ["belted-items", "peplum", "layering", "structured"],
    keywords: ["belted", "peplum", "structured", "layered", "cropped", "fitted"]
  },
  "V-Shape/Athletic": {
    favorable: ["fitted-shirts", "straight-leg", "minimal-shoulder"],
    keywords: ["fitted", "straight-leg", "v-neck", "minimal", "athletic", "casual"]
  }
};

export const STOREFRONT_PRODUCT_TAGS = {
  "Pear/Triangle": "pear-shape,triangle-shape,a-line,wide-leg",
  "Apple/Round": "apple-shape,round-shape,empire-waist,flowing",
  "Hourglass": "hourglass-shape,fitted,wrap,belted",
  "Inverted Triangle": "inverted-triangle,a-line,wide-leg",
  "Rectangle/Straight": "rectangle-shape,straight-shape,belted,peplum",
  "V-Shape/Athletic": "v-shape,athletic,fitted,straight-leg"
};
