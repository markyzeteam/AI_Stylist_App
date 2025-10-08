/**
 * Body Shape Advisor - Customer-facing interface
 * Embedded in Shopify storefront
 */

class BodyShapeAdvisor {
  constructor(containerId, config) {
    this.container = document.getElementById(containerId);
    this.config = config;
    this.currentStep = 'welcome';
    this.bodyShapeResult = null;
    this.productRecommendations = [];
    this.products = []; // Will be loaded from API
    this.productsLoaded = false;
    this.measurements = {
      gender: '',
      age: '',
      height: '',
      weight: '',
      bust: '',
      waist: '',
      hips: '',
      shoulders: '',
      unit: 'metric'
    };

    this.init();
  }

  async init() {
    this.render();
    this.attachEventListeners();
    // Load products in the background
    await this.loadProducts();
  }

  async loadProducts() {
    if (this.productsLoaded) return;

    console.log('Loading products from API...');

    try {
      const apiUrl = `${this.config.apiEndpoint}/api/storefront-products?shop=${encodeURIComponent(this.config.shopDomain)}`;

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.products) {
        this.products = data.products;
        this.productsLoaded = true;
        console.log(`Loaded ${this.products.length} products from API`);
      } else {
        console.error('No products in API response:', data);
        this.products = [];
      }
    } catch (error) {
      console.error('Error loading products from API:', error);
      this.products = [];
    }
  }

  render() {
    const steps = {
      welcome: this.renderWelcome.bind(this),
      pathSelection: this.renderPathSelection.bind(this),
      calculator: this.renderCalculator.bind(this),
      knownShape: this.renderKnownShape.bind(this),
      results: this.renderResults.bind(this),
      products: this.renderProducts.bind(this)
    };

    this.container.innerHTML = steps[this.currentStep]();
  }

  renderWelcome() {
    return `
      <div class="bsa-welcome">
        <h3>Welcome to Your Personal Style Assistant</h3>
        <p>Discover clothing that perfectly fits your body shape and get personalized size recommendations.</p>
        <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.goToStep('pathSelection')">
          Get Started
        </button>
      </div>
    `;
  }

  renderPathSelection() {
    return `
      <div class="bsa-path-selection">
        <h3>How would you like to find your body shape?</h3>

        <div class="bsa-options">
          <div class="bsa-option">
            <div class="bsa-option-icon">📏</div>
            <h4>Take Measurements</h4>
            <p>Answer a few questions and take simple measurements</p>
            <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.goToStep('calculator')">
              Calculate My Shape
            </button>
          </div>

          <div class="bsa-option">
            <div class="bsa-option-icon">✨</div>
            <h4>I Know My Shape</h4>
            <p>Skip to recommendations if you already know your body shape</p>
            <button class="bsa-btn bsa-btn-secondary" onclick="bodyShapeAdvisor.goToStep('knownShape')">
              Select My Shape
            </button>
          </div>
        </div>

        <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('welcome')">
          ← Back
        </button>
      </div>
    `;
  }

  renderCalculator() {
    return `
      <div class="bsa-calculator">
        <div class="bsa-header">
          <h3>Body Shape Calculator</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('pathSelection')">
            ← Back
          </button>
        </div>

        <form class="bsa-form" onsubmit="bodyShapeAdvisor.calculateBodyShape(event)">
          <div class="bsa-form-section">
            <h4>Basic Information</h4>

            <div class="bsa-form-row">
              <div class="bsa-form-field">
                <label>Gender</label>
                <select name="gender" required>
                  <option value="">Select Gender</option>
                  <option value="woman">Woman</option>
                  <option value="man">Man</option>
                  <option value="non-binary">Non-binary</option>
                </select>
              </div>

              <div class="bsa-form-field">
                <label>Age Range</label>
                <select name="age" required>
                  <option value="">Select Age</option>
                  <option value="13-17">13-17</option>
                  <option value="18-25">18-25</option>
                  <option value="26-35">26-35</option>
                  <option value="36-45">36-45</option>
                  <option value="46-55">46-55</option>
                  <option value="56+">56+</option>
                </select>
              </div>
            </div>

            <div class="bsa-form-field">
              <label>Measurement Unit</label>
              <select name="unit" onchange="bodyShapeAdvisor.updateUnits(this.value)">
                <option value="metric">Metric (cm/kg)</option>
                <option value="imperial">Imperial (in/lbs)</option>
              </select>
            </div>
          </div>

          <div class="bsa-form-section">
            <h4>Body Measurements</h4>

            <div class="bsa-form-row">
              <div class="bsa-form-field">
                <label>Height (<span class="unit-label">cm</span>)</label>
                <input type="number" name="height" required placeholder="170">
              </div>

              <div class="bsa-form-field">
                <label>Weight (<span class="unit-weight">kg</span>)</label>
                <input type="number" name="weight" placeholder="65">
              </div>
            </div>

            <div class="bsa-form-row">
              <div class="bsa-form-field">
                <label>Bust/Chest (<span class="unit-label">cm</span>)</label>
                <input type="number" name="bust" required placeholder="90">
                <small>Measure around the fullest part</small>
              </div>

              <div class="bsa-form-field">
                <label>Waist (<span class="unit-label">cm</span>)</label>
                <input type="number" name="waist" required placeholder="70">
                <small>Measure at the narrowest point</small>
              </div>
            </div>

            <div class="bsa-form-row">
              <div class="bsa-form-field">
                <label>Hips (<span class="unit-label">cm</span>)</label>
                <input type="number" name="hips" required placeholder="95">
                <small>Measure around the fullest part</small>
              </div>

              <div class="bsa-form-field">
                <label>Shoulders (<span class="unit-label">cm</span>)</label>
                <input type="number" name="shoulders" placeholder="40">
                <small>Measure across shoulder points</small>
              </div>
            </div>
          </div>

          <button type="submit" class="bsa-btn bsa-btn-primary">
            Calculate My Body Shape
          </button>
        </form>
      </div>
    `;
  }

  renderKnownShape() {
    const shapes = [
      { name: "Pear/Triangle", icon: "🍐", desc: "Hips wider than bust and shoulders" },
      { name: "Apple/Round", icon: "🍎", desc: "Fuller midsection with less defined waist" },
      { name: "Hourglass", icon: "⏳", desc: "Balanced bust and hips with defined waist" },
      { name: "Inverted Triangle", icon: "🔺", desc: "Broader shoulders and bust than hips" },
      { name: "Rectangle/Straight", icon: "📱", desc: "Similar measurements throughout" },
      { name: "V-Shape/Athletic", icon: "💪", desc: "Broad shoulders with narrow waist" }
    ];

    return `
      <div class="bsa-known-shape">
        <div class="bsa-header">
          <h3>Select Your Body Shape</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('pathSelection')">
            ← Back
          </button>
        </div>

        <p>Choose the body shape that best describes you:</p>

        <div class="bsa-shape-grid">
          ${shapes.map(shape => `
            <div class="bsa-shape-card" onclick="bodyShapeAdvisor.selectShape('${shape.name}')">
              <div class="bsa-shape-icon">${shape.icon}</div>
              <h4>${shape.name}</h4>
              <p>${shape.desc}</p>
            </div>
          `).join('')}
        </div>

        <div class="bsa-help">
          <p>Not sure? <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('calculator')">Use our calculator instead</button></p>
        </div>
      </div>
    `;
  }

  renderResults() {
    if (!this.bodyShapeResult) return '';

    return `
      <div class="bsa-results">
        <div class="bsa-header">
          <h3>Your Body Shape Results</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('welcome')">
            Start Over
          </button>
        </div>

        <div class="bsa-result-card">
          <div class="bsa-result-header">
            <h4>${this.bodyShapeResult.shape}</h4>
            <span class="bsa-confidence">${Math.round(this.bodyShapeResult.confidence * 100)}% match</span>
          </div>
          <p>${this.bodyShapeResult.description}</p>
        </div>

        <div class="bsa-recommendations">
          <h4>Style Recommendations for You</h4>
          <ul>
            ${this.bodyShapeResult.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>

        <div class="bsa-next-steps">
          <h4>🛍️ Ready to Shop?</h4>
          <p>Browse our collection to find items perfect for your ${this.bodyShapeResult.shape} body shape!</p>
          <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.browseProducts()">
            Browse Recommended Products
          </button>
        </div>
      </div>
    `;
  }

  goToStep(step) {
    this.currentStep = step;

    // Clear cached data when starting over
    if (step === 'welcome') {
      this.bodyShapeResult = null;
      this.productRecommendations = [];
      this.measurements = {
        gender: '',
        age: '',
        height: '',
        weight: '',
        bust: '',
        waist: '',
        hips: '',
        shoulders: '',
        unit: 'metric'
      };
    }

    this.render();
  }

  updateUnits(unit) {
    const labels = document.querySelectorAll('.unit-label');
    const weightLabels = document.querySelectorAll('.unit-weight');

    labels.forEach(label => {
      label.textContent = unit === 'metric' ? 'cm' : 'in';
    });

    weightLabels.forEach(label => {
      label.textContent = unit === 'metric' ? 'kg' : 'lbs';
    });
  }

  calculateBodyShape(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const measurements = Object.fromEntries(formData.entries());

    // Convert to numbers
    ['height', 'weight', 'bust', 'waist', 'hips', 'shoulders'].forEach(field => {
      if (measurements[field]) {
        measurements[field] = parseFloat(measurements[field]);
      }
    });

    // Simple body shape calculation (simplified version)
    this.bodyShapeResult = this.calculateShape(measurements);
    this.goToStep('results');
  }

  selectShape(shapeName) {
    this.bodyShapeResult = {
      shape: shapeName,
      description: this.getShapeDescription(shapeName),
      confidence: 1.0,
      characteristics: [this.getShapeCharacteristics(shapeName)],
      recommendations: this.getShapeRecommendations(shapeName)
    };
    this.goToStep('results');
  }

  calculateShape(measurements) {
    // Simplified calculation logic
    const { bust, waist, hips, gender } = measurements;

    if (gender === 'woman') {
      const bustHipDiff = Math.abs(bust - hips);
      const bustWaistDiff = bust - waist;
      const hipWaistDiff = hips - waist;

      if (hipWaistDiff > 25 && bust < hips - 20) {
        return {
          shape: "Pear/Triangle",
          description: "Hips are wider than bust and shoulders",
          confidence: 0.9,
          characteristics: ["Fuller hips and thighs", "Narrower shoulders and bust"],
          recommendations: this.getShapeRecommendations("Pear/Triangle")
        };
      } else if (bustHipDiff < 20 && bustWaistDiff > 25 && hipWaistDiff > 25) {
        return {
          shape: "Hourglass",
          description: "Balanced bust and hips with defined waist",
          confidence: 0.95,
          characteristics: ["Balanced measurements", "Well-defined waist"],
          recommendations: this.getShapeRecommendations("Hourglass")
        };
      } else {
        return {
          shape: "Rectangle/Straight",
          description: "Similar measurements throughout",
          confidence: 0.8,
          characteristics: ["Balanced proportions"],
          recommendations: this.getShapeRecommendations("Rectangle/Straight")
        };
      }
    } else {
      return {
        shape: "V-Shape/Athletic",
        description: "Athletic build",
        confidence: 0.8,
        characteristics: ["Athletic build"],
        recommendations: this.getShapeRecommendations("V-Shape/Athletic")
      };
    }
  }

  getShapeDescription(shape) {
    const descriptions = {
      "Pear/Triangle": "Hips wider than bust and shoulders",
      "Apple/Round": "Fuller midsection with less defined waist",
      "Hourglass": "Balanced bust and hips with defined waist",
      "Inverted Triangle": "Broader shoulders and bust than hips",
      "Rectangle/Straight": "Similar measurements throughout",
      "V-Shape/Athletic": "Broad shoulders with narrow waist"
    };
    return descriptions[shape] || "";
  }

  getShapeCharacteristics(shape) {
    const characteristics = {
      "Pear/Triangle": "Fuller hips and thighs, narrower shoulders",
      "Apple/Round": "Fuller bust and midsection, slimmer legs",
      "Hourglass": "Curved silhouette, well-defined waist",
      "Inverted Triangle": "Broader shoulders, narrower hips",
      "Rectangle/Straight": "Balanced proportions, minimal waist definition",
      "V-Shape/Athletic": "Athletic build, muscular shoulders"
    };
    return characteristics[shape] || "";
  }

  getShapeRecommendations(shape) {
    const recommendations = {
      "Pear/Triangle": [
        "A-line and fit-and-flare dresses",
        "Wide-leg pants and bootcut jeans",
        "Tops with interesting necklines",
        "Structured blazers to balance shoulders"
      ],
      "Apple/Round": [
        "Empire waist dresses",
        "V-neck and scoop neck tops",
        "High-waisted bottoms",
        "Flowing fabrics that skim the body"
      ],
      "Hourglass": [
        "Fitted clothing that follows your curves",
        "Wrap dresses and tops",
        "High-waisted styles",
        "Belted garments to emphasize waist"
      ],
      "Inverted Triangle": [
        "A-line skirts and dresses",
        "Wide-leg pants",
        "Scoop and V-necklines",
        "Minimize shoulder details"
      ],
      "Rectangle/Straight": [
        "Create curves with belts and fitted styles",
        "Layering to add dimension",
        "Peplum tops and dresses",
        "Cropped jackets and structured pieces"
      ],
      "V-Shape/Athletic": [
        "Fitted shirts that show your shape",
        "Straight-leg pants",
        "Minimal shoulder padding",
        "V-necks and open collars"
      ]
    };
    return recommendations[shape] || [];
  }

  async browseProducts() {
    // Get AI-powered recommendations from Claude
    this.currentStep = 'products';
    this.render();

    const bodyShape = this.bodyShapeResult.shape;

    console.log(`Getting Claude AI recommendations for ${bodyShape}`);

    try {
      // Call Claude AI API for recommendations
      const recommendations = await this.getClaudeRecommendations(bodyShape);

      if (recommendations && recommendations.length > 0) {
        console.log(`✓ Got ${recommendations.length} Claude AI recommendations`);
        this.productRecommendations = recommendations;
      } else {
        // Fallback to basic algorithm
        console.log('⚠ No Claude recommendations, using fallback');
        await this.loadProducts();
        const settings = this.config.settings || {
          numberOfSuggestions: 30,
          minimumMatchScore: 30,
          maxProductsToScan: 1000
        };
        this.productRecommendations = this.fallbackRecommendations(
          this.products.slice(0, settings.maxProductsToScan),
          bodyShape,
          settings
        );
      }
    } catch (error) {
      console.error('Error getting Claude recommendations:', error);
      // Fallback to basic algorithm
      await this.loadProducts();
      const settings = this.config.settings || {
        numberOfSuggestions: 30,
        minimumMatchScore: 30,
        maxProductsToScan: 1000
      };
      this.productRecommendations = this.fallbackRecommendations(
        this.products.slice(0, settings.maxProductsToScan),
        bodyShape,
        settings
      );
    }

    this.render();
  }

  async getClaudeRecommendations(bodyShape) {
    console.log(`🤖 Calling Claude API for ${bodyShape} recommendations...`);
    console.log(`API Endpoint: ${this.config.apiEndpoint}`);
    console.log(`Shop Domain: ${this.config.shopDomain}`);

    const formData = new FormData();
    formData.append('storeDomain', this.config.shopDomain);
    formData.append('bodyShape', bodyShape);

    // Add settings from config
    if (this.config.settings) {
      formData.append('numberOfSuggestions', this.config.settings.numberOfSuggestions || 30);
      formData.append('minimumMatchScore', this.config.settings.minimumMatchScore || 30);
      // If scanAllProducts is true, send 0, otherwise use the limit
      const maxScan = this.config.settings.scanAllProducts !== false ? 0 : (this.config.settings.maxProductsToScan || 1000);
      formData.append('maxProductsToScan', maxScan);
      formData.append('onlyInStock', this.config.settings.onlyInStock !== false); // default true
      console.log(`Settings: suggestions=${this.config.settings.numberOfSuggestions}, minScore=${this.config.settings.minimumMatchScore}, scanAll=${this.config.settings.scanAllProducts}, maxScan=${maxScan}, inStock=${this.config.settings.onlyInStock}`);
    }

    // Add measurements if available
    if (this.measurements.bust) {
      formData.append('bust', this.measurements.bust);
      console.log(`Added measurement: bust=${this.measurements.bust}`);
    }
    if (this.measurements.waist) {
      formData.append('waist', this.measurements.waist);
      console.log(`Added measurement: waist=${this.measurements.waist}`);
    }
    if (this.measurements.hips) {
      formData.append('hips', this.measurements.hips);
      console.log(`Added measurement: hips=${this.measurements.hips}`);
    }
    if (this.measurements.shoulders) {
      formData.append('shoulders', this.measurements.shoulders);
      console.log(`Added measurement: shoulders=${this.measurements.shoulders}`);
    }
    if (this.measurements.gender) {
      formData.append('gender', this.measurements.gender);
      console.log(`Added measurement: gender=${this.measurements.gender}`);
    }
    if (this.measurements.age) {
      formData.append('age', this.measurements.age);
      console.log(`Added measurement: age=${this.measurements.age}`);
    }

    const apiUrl = `${this.config.apiEndpoint}/api/claude/recommendations`;
    console.log(`Fetching from: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData
    });

    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error response: ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Claude API response:`, data);

    if (data.recommendations) {
      console.log(`✓ Transforming ${data.recommendations.length} Claude recommendations`);
      // Transform Claude API response to match expected format
      return data.recommendations.map(rec => ({
        title: rec.product.title,
        handle: rec.product.handle,
        image: rec.product.images?.[0]?.src || rec.product.imageUrl,
        price: rec.product.variants?.[0]?.price || rec.product.price,
        match: Math.round(rec.suitabilityScore * 100),
        reasoning: rec.reasoning,
        sizeAdvice: rec.recommendedSize,
        stylingTip: rec.stylingTip,
        category: rec.category,
        url: rec.product.url
      }));
    }

    console.log('⚠ No recommendations in API response');
    return [];
  }

  fallbackRecommendations(allProducts, bodyShape, settings) {
    // Calculate suitability for each product
    const scoredProducts = allProducts.map(product => {
      const score = this.calculateProductSuitability(product, bodyShape);
      const category = this.determineProductCategory(product);
      return {
        ...product,
        match: Math.round(score * 100),
        reasoning: this.generateReasoning(product, bodyShape, score),
        sizeAdvice: this.getSizeAdvice(product, bodyShape),
        category: category
      };
    });

    // Filter by minimum score
    const minScore = settings?.minimumMatchScore || 30;
    const filtered = scoredProducts.filter(p => p.match >= minScore);

    // If category mix is enabled, ensure diverse recommendations
    if (settings?.ensureCategoryMix) {
      return this.ensureCategoryMix(filtered, settings);
    }

    // Otherwise, just return top matches
    const limit = settings?.numberOfSuggestions || 30;
    return filtered
      .sort((a, b) => b.match - a.match)
      .slice(0, limit);
  }

  ensureCategoryMix(products, settings) {
    const minTops = settings?.minTops || 5;
    const minBottoms = settings?.minBottoms || 5;
    const minDresses = settings?.minDresses || 3;
    const minAccessories = settings?.minAccessories || 2;
    const totalLimit = settings?.numberOfSuggestions || 30;

    // Group products by category
    const byCategory = {
      tops: products.filter(p => p.category === 'tops').sort((a, b) => b.match - a.match),
      bottoms: products.filter(p => p.category === 'bottoms').sort((a, b) => b.match - a.match),
      dresses: products.filter(p => p.category === 'dresses').sort((a, b) => b.match - a.match),
      accessories: products.filter(p => p.category === 'accessories').sort((a, b) => b.match - a.match),
      other: products.filter(p => p.category === 'other').sort((a, b) => b.match - a.match)
    };

    // Start with minimum required from each category
    let results = [
      ...byCategory.tops.slice(0, minTops),
      ...byCategory.bottoms.slice(0, minBottoms),
      ...byCategory.dresses.slice(0, minDresses),
      ...byCategory.accessories.slice(0, minAccessories)
    ];

    // Fill remaining slots with best matches from any category
    if (results.length < totalLimit) {
      const remaining = products
        .filter(p => !results.some(r => r.handle === p.handle))
        .sort((a, b) => b.match - a.match)
        .slice(0, totalLimit - results.length);

      results = [...results, ...remaining];
    }

    // Sort final results by match score
    return results.sort((a, b) => b.match - a.match).slice(0, totalLimit);
  }

  determineProductCategory(product) {
    const productText = `${product.title} ${product.description} ${product.productType}`.toLowerCase();

    if (productText.includes('dress') || productText.includes('gown')) {
      return 'dresses';
    }
    if (productText.includes('top') || productText.includes('shirt') || productText.includes('blouse') ||
        productText.includes('sweater') || productText.includes('tee') || productText.includes('jacket') ||
        productText.includes('blazer') || productText.includes('cardigan')) {
      return 'tops';
    }
    if (productText.includes('pant') || productText.includes('jean') || productText.includes('trouser') ||
        productText.includes('short') || productText.includes('skirt') || productText.includes('legging')) {
      return 'bottoms';
    }
    if (productText.includes('bag') || productText.includes('jewelry') || productText.includes('necklace') ||
        productText.includes('earring') || productText.includes('bracelet') || productText.includes('scarf') ||
        productText.includes('belt') || productText.includes('hat') || productText.includes('accessory')) {
      return 'accessories';
    }

    return 'other';
  }

  calculateProductSuitability(product, bodyShape) {
    const preferences = this.getBodyShapePreferences(bodyShape);
    if (!preferences) return 0.5;

    let score = 0.5;
    const productText = `${product.title} ${product.description} ${product.productType} ${product.tags.join(' ')}`.toLowerCase();

    // Check for favorable keywords
    preferences.keywords.forEach(keyword => {
      if (productText.includes(keyword.toLowerCase())) {
        score += 0.15;
      }
    });

    // Check product tags
    product.tags.forEach(tag => {
      const tagLower = tag.toLowerCase();
      if (preferences.keywords.some(kw => tagLower.includes(kw.toLowerCase()))) {
        score += 0.1;
      }
    });

    return Math.max(0, Math.min(1, score));
  }

  getBodyShapePreferences(bodyShape) {
    const preferences = {
      "Pear/Triangle": {
        keywords: ["a-line", "fit-and-flare", "empire-waist", "bootcut", "wide-leg", "structured-shoulders", "top", "blouse", "jacket"]
      },
      "Apple/Round": {
        keywords: ["empire-waist", "v-neck", "scoop-neck", "high-waisted", "flowing", "wrap", "tunic", "dress"]
      },
      "Hourglass": {
        keywords: ["fitted", "wrap", "belted", "high-waisted", "curve-hugging", "bodycon", "dress"]
      },
      "Inverted Triangle": {
        keywords: ["a-line", "wide-leg", "bootcut", "scoop-neck", "v-neck", "skirt", "pant"]
      },
      "Rectangle/Straight": {
        keywords: ["belted", "peplum", "structured", "layered", "cropped", "fitted"]
      },
      "V-Shape/Athletic": {
        keywords: ["fitted", "straight-leg", "v-neck", "minimal", "athletic", "casual"]
      }
    };

    return preferences[bodyShape];
  }

  generateReasoning(product, bodyShape, score) {
    if (score > 0.7) {
      return `Excellent match for ${bodyShape} body shape - this style is highly recommended for your figure`;
    } else if (score > 0.5) {
      return `Good choice for ${bodyShape} body shape - this style complements your figure well`;
    } else {
      return `Suitable option for ${bodyShape} body shape - consider your personal style preferences`;
    }
  }

  getSizeAdvice(product, bodyShape) {
    const advice = {
      "Pear/Triangle": "Focus on hip measurement, may need larger size for bottoms",
      "Apple/Round": "Empire waist or flowing styles work well, size for bust",
      "Hourglass": "Size for largest measurement, fitted styles work best",
      "Inverted Triangle": "Size for shoulders/bust, A-line styles recommended",
      "Rectangle/Straight": "Standard sizing, belted styles create curves",
      "V-Shape/Athletic": "Size for chest/shoulders, fitted cuts work well"
    };

    return advice[bodyShape] || "Check the size chart for best fit";
  }

  renderProducts() {
    if (!this.bodyShapeResult) return '';

    const products = this.productRecommendations || [];

    return `
      <div class="bsa-products">
        <div class="bsa-header">
          <h3>🛍️ Recommended Products for ${this.bodyShapeResult.shape}</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('results')">
            ← Back to Results
          </button>
        </div>

        ${products.length === 0 ? `
          <div class="bsa-loading">
            <div class="bsa-loading-spinner"></div>
            <h4>🤖 AI Fashion Stylist at Work...</h4>
            <p class="bsa-loading-message">Analyzing your ${this.bodyShapeResult.shape} body shape</p>
            <p class="bsa-loading-submessage">Our AI is reviewing products to find your perfect match. This may take 10-30 seconds.</p>
            <div class="bsa-loading-steps">
              <div class="bsa-loading-step bsa-step-active">✓ Fetching products from catalog</div>
              <div class="bsa-loading-step bsa-step-active">✓ Filtering by body shape preferences</div>
              <div class="bsa-loading-step bsa-step-processing">⏳ Claude AI analyzing matches...</div>
              <div class="bsa-loading-step">○ Preparing recommendations</div>
            </div>
          </div>
        ` : `
          <div class="bsa-product-grid">
            ${products.map(product => `
              <div class="bsa-product-card">
                ${product.image ? `
                  <img src="${product.image}" alt="${product.title}" class="bsa-product-image">
                ` : ''}
                <div class="bsa-product-info">
                  <h4>${product.title}</h4>
                  ${product.price ? `<p class="bsa-product-price">$${product.price}</p>` : ''}
                  ${product.match ? `
                    <span class="bsa-product-match">${product.match}% match</span>
                  ` : ''}
                  ${product.reasoning ? `
                    <p class="bsa-product-reasoning">✨ ${product.reasoning}</p>
                  ` : ''}
                  ${product.sizeAdvice ? `
                    <p class="bsa-product-size-advice">📏 <strong>Size advice:</strong> ${product.sizeAdvice}</p>
                  ` : ''}
                  ${product.stylingTip ? `
                    <p class="bsa-product-styling-tip">💡 <strong>Styling tip:</strong> ${product.stylingTip}</p>
                  ` : ''}
                  <a href="https://${this.config.shopDomain}/products/${product.handle}" class="bsa-btn bsa-btn-primary" target="_blank">View Product</a>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  attachEventListeners() {
    // Event listeners are handled via onclick attributes for simplicity
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('body-shape-advisor-app');
  if (container && window.BodyShapeAdvisorConfig) {
    window.bodyShapeAdvisor = new BodyShapeAdvisor('body-shape-advisor-app', window.BodyShapeAdvisorConfig);
  }
});