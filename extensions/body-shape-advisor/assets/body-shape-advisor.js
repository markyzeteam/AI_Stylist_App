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
    this.colorSeasonResult = null;
    this.productRecommendations = [];
    this.products = []; // Will be loaded from API
    this.productsLoaded = false;
    this.budgetSettings = {
      budgetLowMax: 30,
      budgetMediumMax: 80,
      budgetHighMax: 200
    }; // Will be loaded from API
    this.budgetSettingsLoaded = false;
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
    this.colorAnalysis = {
      undertone: '', // warm/cool
      depth: '', // light/medium/deep
      intensity: '' // bright/muted
    };
    this.valuesPreferences = {
      sustainability: false,
      budgetRange: null, // Will be set when user fills questionnaire
      styles: [], // Will be populated when user fills questionnaire
      completed: false // Track if questionnaire was completed
    };
    this.celebrityRecommendations = null; // Will be loaded from Gemini API

    this.init();
  }

  async init() {
    this.render();
    this.attachEventListeners();
    // Load products and budget settings in the background
    await Promise.all([
      this.loadProducts(),
      this.loadBudgetSettings()
    ]);
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

  async loadBudgetSettings() {
    if (this.budgetSettingsLoaded) return;

    console.log('Loading budget settings from API...');

    try {
      const apiUrl = `${this.config.apiEndpoint}/api/budget-settings?shop=${encodeURIComponent(this.config.shopDomain)}`;

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.budgetLowMax && data.budgetMediumMax && data.budgetHighMax) {
        this.budgetSettings = data;
        this.budgetSettingsLoaded = true;
        console.log(`Loaded budget settings:`, this.budgetSettings);
      } else {
        console.error('Invalid budget settings in API response:', data);
      }
    } catch (error) {
      console.error('Error loading budget settings from API:', error);
      // Keep default values
    }
  }

  render() {
    const steps = {
      welcome: this.renderWelcome.bind(this),
      pathSelection: this.renderPathSelection.bind(this),
      calculator: this.renderCalculator.bind(this),
      knownShape: this.renderKnownShape.bind(this),
      analysisLoading: this.renderAnalysisLoading.bind(this),
      results: this.renderResults.bind(this),
      colorSeasonPathSelection: this.renderColorSeasonPathSelection.bind(this),
      colorSeason: this.renderColorSeason.bind(this),
      knownColorSeason: this.renderKnownColorSeason.bind(this),
      colorSeasonAnalysisLoading: this.renderColorSeasonAnalysisLoading.bind(this),
      colorSeasonResults: this.renderColorSeasonResults.bind(this),
      valuesQuestionnaire: this.renderValuesQuestionnaire.bind(this),
      combinedAnalysisLoading: this.renderCombinedAnalysisLoading.bind(this),
      combinedResults: this.renderCombinedResults.bind(this),
      styleSummary: this.renderStyleSummary.bind(this),
      products: this.renderProducts.bind(this),
      insufficientData: this.renderInsufficientData.bind(this)
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

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('welcome')">
            ← Back
          </button>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.skipBodyShape()">
            Skip →
          </button>
        </div>
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

            <div style="text-align: center; margin-bottom: 1.5rem;">
              <p style="margin-bottom: 0.5rem; font-weight: 500;">📏 How to Measure</p>
              <img
                src="https://www.carlyjeanlosangeles.com/cdn/shop/files/CJLA-Measuring-Guide-FINAL_96976614-70e1-4eaa-8cf6-b6cd5f4491f9_2048x.jpg?v=1727893667"
                alt="Measuring Guide - How to take body measurements"
                style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
              />
            </div>

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
                <input type="number" name="shoulders" required placeholder="40">
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

  renderAnalysisLoading() {
    return `
      <div class="bsa-results">
        <div class="bsa-loading">
          <div class="bsa-loading-spinner"></div>
          <h4>🤖 AI Fashion Stylist Analyzing...</h4>
          <p class="bsa-loading-message">Analyzing your body shape profile</p>
          <p class="bsa-loading-submessage">Our AI is preparing personalized style recommendations. This may take 10-30 seconds.</p>
          <div class="bsa-loading-steps">
            <div class="bsa-loading-step bsa-step-active">✓ Body shape identified</div>
            <div class="bsa-loading-step bsa-step-processing">⏳ Gemini AI analyzing style preferences...</div>
            <div class="bsa-loading-step">○ Generating recommendations</div>
            <div class="bsa-loading-step">○ Preparing results</div>
          </div>
        </div>
      </div>
    `;
  }

  renderColorSeasonAnalysisLoading() {
    return `
      <div class="bsa-results">
        <div class="bsa-loading">
          <div class="bsa-loading-spinner"></div>
          <h4>🎨 AI Color Specialist Analyzing...</h4>
          <p class="bsa-loading-message">Analyzing your color season profile</p>
          <p class="bsa-loading-submessage">Our AI is preparing personalized color recommendations. This may take 10-30 seconds.</p>
          <div class="bsa-loading-steps">
            <div class="bsa-loading-step bsa-step-active">✓ Color season identified</div>
            <div class="bsa-loading-step bsa-step-processing">⏳ Gemini AI analyzing color palette...</div>
            <div class="bsa-loading-step">○ Generating color recommendations</div>
            <div class="bsa-loading-step">○ Preparing results</div>
          </div>
        </div>
      </div>
    `;
  }

  renderResults() {
    if (!this.bodyShapeResult) return '';

    const claudeAnalysis = this.bodyShapeResult.claudeAnalysis;

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

        ${claudeAnalysis ? `
          <div class="bsa-recommendations bsa-claude-analysis">
            <h4>🤖 AI Fashion Stylist Analysis</h4>

            ${claudeAnalysis.analysis ? `
              <div class="bsa-analysis-section">
                <p style="line-height: 1.6; color: #374151; white-space: pre-line;">${claudeAnalysis.analysis}</p>
              </div>
            ` : ''}

            ${claudeAnalysis.styleGoals && claudeAnalysis.styleGoals.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #4f46e5; margin-top: 1.5rem;">Style Goals</h5>
                <ul style="padding-left: 1.5rem;">
                  ${claudeAnalysis.styleGoals.map(goal => `<li style="margin: 0.5rem 0;">${goal}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${claudeAnalysis.recommendations && claudeAnalysis.recommendations.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #4f46e5; margin-top: 1.5rem;">Recommended Clothing & Styling</h5>
                ${claudeAnalysis.recommendations.map(rec => `
                  <div style="margin: 1.5rem 0; padding: 1rem; background: #f9fafb; border-radius: 8px; border-left: 4px solid #4f46e5;">
                    <h6 style="color: #1f2937; margin: 0 0 0.5rem 0; font-weight: 600;">${rec.category}</h6>
                    <ul style="padding-left: 1.5rem; margin: 0.5rem 0;">
                      ${rec.items.map(item => `<li style="margin: 0.25rem 0;">${item}</li>`).join('')}
                    </ul>
                    <p style="margin: 0.75rem 0 0 0; color: #6b7280; font-style: italic;"><strong>Why:</strong> ${rec.reasoning}</p>
                    ${rec.stylingTips ? `<p style="margin: 0.5rem 0 0 0; color: #059669;"><strong>💡 Styling Tip:</strong> ${rec.stylingTips}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${claudeAnalysis.avoidItems && claudeAnalysis.avoidItems.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #dc2626; margin-top: 1.5rem;">What to Avoid</h5>
                <div style="background: #fef2f2; padding: 1rem; border-radius: 8px; border-left: 4px solid #dc2626;">
                  ${claudeAnalysis.avoidItems.map(avoid => `
                    <p style="margin: 0.5rem 0;"><strong>${avoid.item}:</strong> ${avoid.reason}</p>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${claudeAnalysis.proTips && claudeAnalysis.proTips.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #059669; margin-top: 1.5rem;">Pro Tips</h5>
                <ul style="padding-left: 1.5rem;">
                  ${claudeAnalysis.proTips.map(tip => `<li style="margin: 0.5rem 0; color: #374151;">${tip}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="bsa-recommendations">
            <h4>Style Recommendations for You</h4>
            <ul>
              ${this.bodyShapeResult.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
        `}

        <div class="bsa-next-steps">
          <h4>🛍️ What's Next?</h4>
          <p>Enhance your recommendations or start shopping now!</p>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
            <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.goToStep('colorSeasonPathSelection')" style="flex: 1; min-width: 200px;">
              Add Color Season Analysis
            </button>
            <button class="bsa-btn bsa-btn-secondary" onclick="bodyShapeAdvisor.goToStep('valuesQuestionnaire')" style="flex: 1; min-width: 200px;">
              Set Shopping Preferences
            </button>
          </div>
          <div style="text-align: center;">
            <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.browseProducts()" style="text-decoration: underline;">
              Skip to Products →
            </button>
          </div>
        </div>
      </div>
    `;
  }

  goToStep(step) {
    this.currentStep = step;

    // Clear cached data when starting over
    if (step === 'welcome') {
      this.bodyShapeResult = null;
      this.colorSeasonResult = null;
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
      this.colorAnalysis = {
        undertone: '',
        depth: '',
        intensity: ''
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

  async calculateBodyShape(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const measurements = Object.fromEntries(formData.entries());

    // Convert to numbers
    ['height', 'weight', 'bust', 'waist', 'hips', 'shoulders'].forEach(field => {
      if (measurements[field]) {
        measurements[field] = parseFloat(measurements[field]);
      }
    });

    // Convert imperial to metric if needed
    if (measurements.unit === 'imperial') {
      // Convert inches to cm (1 inch = 2.54 cm)
      if (measurements.height) measurements.height = measurements.height * 2.54;
      if (measurements.bust) measurements.bust = measurements.bust * 2.54;
      if (measurements.waist) measurements.waist = measurements.waist * 2.54;
      if (measurements.hips) measurements.hips = measurements.hips * 2.54;
      if (measurements.shoulders) measurements.shoulders = measurements.shoulders * 2.54;

      // Convert lbs to kg (1 lb = 0.453592 kg)
      if (measurements.weight) measurements.weight = measurements.weight * 0.453592;

      // Mark that we've converted to metric
      measurements.unit = 'metric';
    }

    // Store measurements for later use (always in metric/cm)
    this.measurements = measurements;

    // Simple body shape calculation (simplified version)
    this.bodyShapeResult = this.calculateShape(measurements);

    // Skip intermediate API call - go directly to color season quiz
    // Analysis will be done in combined call after all quizzes
    this.goToStep('colorSeasonPathSelection');
  }

  async selectShape(shapeName) {
    this.bodyShapeResult = {
      shape: shapeName,
      description: this.getShapeDescription(shapeName),
      confidence: 1.0,
      characteristics: [this.getShapeCharacteristics(shapeName)],
      recommendations: this.getShapeRecommendations(shapeName)
    };

    // Skip intermediate API call - go directly to color season quiz
    // Analysis will be done in combined call after all quizzes
    this.goToStep('colorSeasonPathSelection');
  }

  calculateShape(measurements) {
    // Simplified calculation logic
    const { bust, waist, hips, shoulders, gender } = measurements;

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
      // Proper masculine body shape calculation
      const chest = parseFloat(bust) || 0;
      const waistNum = parseFloat(waist) || 0;
      const shouldersNum = parseFloat(shoulders) || 0;

      // Calculate ratios
      const shoulderWaistRatio = shouldersNum / waistNum;
      const chestWaistRatio = chest / waistNum;

      console.log('🔍 Male body shape calculation:', {
        chest,
        waist: waistNum,
        shoulders: shouldersNum,
        shoulderWaistRatio: shoulderWaistRatio.toFixed(2),
        chestWaistRatio: chestWaistRatio.toFixed(2),
        shouldersEmpty: !shoulders,
        allEqual: chest === waistNum && shouldersNum === waistNum
      });

      // Handle invalid/missing data
      if (waistNum === 0 || isNaN(shoulderWaistRatio) || isNaN(chestWaistRatio)) {
        console.warn('⚠️ Invalid measurements detected, defaulting to Rectangle');
        return {
          shape: "Rectangle/Straight",
          description: "Balanced proportions throughout torso",
          confidence: 0.5,
          characteristics: ["Shoulders and waist similar width", "Straight silhouette"],
          recommendations: this.getShapeRecommendations("Rectangle/Straight")
        };
      }

      // V-Shape/Athletic (very broad shoulders & chest, narrow waist)
      // Both conditions must be true (AND logic) to ensure truly athletic build
      if (shoulderWaistRatio > 1.3 && chestWaistRatio > 1.25) {
        console.log('✅ Matched V-Shape/Athletic');
        return {
          shape: "V-Shape/Athletic",
          description: "Broad shoulders and chest with narrow waist",
          confidence: 0.9,
          characteristics: ["Broad shoulders and chest", "Narrow waist", "Athletic build"],
          recommendations: this.getShapeRecommendations("V-Shape/Athletic")
        };
      }

      // Inverted Triangle/Trapezoid (broader shoulders than waist, but not dramatically)
      if ((shoulderWaistRatio > 1.15 || chestWaistRatio > 1.15) && shoulderWaistRatio <= 1.3) {
        console.log('✅ Matched Inverted Triangle');
        return {
          shape: "Inverted Triangle",
          description: "Broader shoulders than waist, athletic frame",
          confidence: 0.85,
          characteristics: ["Broader shoulders", "Defined upper body", "Narrower waist"],
          recommendations: this.getShapeRecommendations("Inverted Triangle")
        };
      }

      // Rectangle/Straight (balanced proportions)
      // Most men with average proportions fall here
      if (shoulderWaistRatio >= 0.9 && shoulderWaistRatio <= 1.15 &&
          chestWaistRatio >= 0.9 && chestWaistRatio <= 1.15) {
        console.log('✅ Matched Rectangle/Straight');
        return {
          shape: "Rectangle/Straight",
          description: "Balanced proportions throughout torso",
          confidence: 0.85,
          characteristics: ["Shoulders and waist similar width", "Straight silhouette"],
          recommendations: this.getShapeRecommendations("Rectangle/Straight")
        };
      }

      // Triangle/Pear (narrow shoulders, wider hips - less common in men)
      if (shoulderWaistRatio < 0.9 && shouldersNum < waistNum) {
        console.log('✅ Matched Triangle/Pear');
        return {
          shape: "Triangle/Pear",
          description: "Narrower shoulders, fuller lower body",
          confidence: 0.8,
          characteristics: ["Narrower shoulders", "Fuller midsection and hips"],
          recommendations: this.getShapeRecommendations("Triangle/Pear")
        };
      }

      console.log('⬇️ Falling through to Oval/Apple');

      // Oval/Apple (fuller midsection, default catch-all)
      return {
        shape: "Oval/Apple",
        description: "Fuller midsection with broader waist",
        confidence: 0.8,
        characteristics: ["Fuller midsection", "Less defined waist"],
        recommendations: this.getShapeRecommendations("Oval/Apple")
      };
    }
  }

  getShapeDescription(shape) {
    const descriptions = {
      "Pear/Triangle": "Hips wider than bust and shoulders",
      "Triangle/Pear": "Narrower shoulders, fuller lower body",
      "Apple/Round": "Fuller midsection with less defined waist",
      "Oval/Apple": "Fuller midsection with broader waist",
      "Hourglass": "Balanced bust and hips with defined waist",
      "Inverted Triangle": "Broader shoulders than waist, athletic frame",
      "Rectangle/Straight": "Similar measurements throughout",
      "V-Shape/Athletic": "Broad shoulders with narrow waist"
    };
    return descriptions[shape] || "";
  }

  getShapeCharacteristics(shape) {
    const characteristics = {
      "Pear/Triangle": "Fuller hips and thighs, narrower shoulders",
      "Triangle/Pear": "Narrower shoulders, fuller midsection and hips",
      "Apple/Round": "Fuller bust and midsection, slimmer legs",
      "Oval/Apple": "Fuller midsection, less defined waist, broader torso",
      "Hourglass": "Curved silhouette, well-defined waist",
      "Inverted Triangle": "Broader shoulders, defined upper body, narrower waist",
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
      "Triangle/Pear": [
        "Structured jackets to broaden shoulders",
        "Horizontal stripes on upper body",
        "Darker colors on lower body",
        "Straight-leg or bootcut pants",
        "Avoid skinny jeans"
      ],
      "Apple/Round": [
        "Empire waist dresses",
        "V-neck and scoop neck tops",
        "High-waisted bottoms",
        "Flowing fabrics that skim the body"
      ],
      "Oval/Apple": [
        "Vertical lines and patterns",
        "Open jackets and cardigans",
        "Darker colors on torso",
        "V-neck and scoop neck tops",
        "Straight-cut shirts",
        "Avoid tight-fitting clothes around midsection"
      ],
      "Hourglass": [
        "Fitted clothing that follows your curves",
        "Wrap dresses and tops",
        "High-waisted styles",
        "Belted garments to emphasize waist"
      ],
      "Inverted Triangle": [
        "Balance broad shoulders with fitted waist",
        "Straight-leg or slim-fit pants",
        "V-neck shirts to elongate torso",
        "Avoid shoulder pads or epaulettes",
        "Fitted shirts that taper at waist",
        "Darker colors on top, lighter on bottom"
      ],
      "Rectangle/Straight": [
        "Layering to add dimension",
        "Fitted cuts to create shape",
        "Horizontal stripes",
        "Structured jackets",
        "Textured fabrics"
      ],
      "V-Shape/Athletic": [
        "Fitted shirts that show your shape",
        "Straight-leg pants",
        "Minimal shoulder padding",
        "V-necks and open collars",
        "Tapered fits at the waist"
      ]
    };
    return recommendations[shape] || [];
  }

  async getClaudeStyleAnalysis(bodyShape, measurements) {
    console.log(`🤖 Getting Gemini AI style analysis for ${bodyShape}...`);

    try {
      const apiUrl = `${this.config.apiEndpoint}/api/gemini/body-shape-analysis`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bodyShape: bodyShape,
          measurements: measurements,
          shop: this.config.shopDomain
        })
      });

      if (!response.ok) {
        console.error(`API error: ${response.status}`);
        return;
      }

      const data = await response.json();

      if (data.success && data.analysis) {
        console.log('✓ Got Gemini AI style analysis');
        this.bodyShapeResult.claudeAnalysis = data.analysis;
      }
    } catch (error) {
      console.error('Error getting Gemini AI style analysis:', error);
      // Continue without Gemini analysis if it fails
    }
  }

  async browseProducts() {
    // Go directly to product recommendations using body shape only
    // Clear previous recommendations to force fresh fetch
    this.productRecommendations = [];
    this.currentStep = 'products';
    this.render();

    const bodyShape = this.bodyShapeResult.shape;

    console.log(`Getting Gemini AI recommendations for ${bodyShape} (body shape only)`);

    try {
      // Call Gemini AI API for recommendations with body shape only (no color season)
      const recommendations = await this.getClaudeRecommendations(bodyShape, null);

      if (recommendations && recommendations.length > 0) {
        console.log(`✓ Got ${recommendations.length} Gemini AI recommendations`);
        this.productRecommendations = recommendations;
      } else {
        // Fallback to basic algorithm
        console.log('⚠ No Gemini recommendations, using fallback');
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
      console.error('Error getting Gemini recommendations:', error);
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

  async getProductsAfterColorSeason() {
    // Get AI-powered recommendations from Gemini using both body shape and color season
    // Clear previous recommendations to force fresh fetch with new parameters
    this.productRecommendations = [];
    this.currentStep = 'products';
    this.render();

    const bodyShape = this.bodyShapeResult.shape;
    const colorSeason = this.colorSeasonResult;

    console.log(`Getting Gemini AI recommendations for ${bodyShape} + ${colorSeason}`);

    try {
      // Call Gemini AI API for recommendations with both body shape and color season
      const recommendations = await this.getClaudeRecommendations(bodyShape, colorSeason);

      if (recommendations && recommendations.length > 0) {
        console.log(`✓ Got ${recommendations.length} Gemini AI recommendations`);
        this.productRecommendations = recommendations;
      } else {
        // Fallback to basic algorithm
        console.log('⚠ No Gemini recommendations, using fallback');
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
      console.error('Error getting Gemini recommendations:', error);
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

  async getClaudeRecommendations(bodyShape, colorSeason = null) {
    console.log(`🤖 Calling Gemini API for ${bodyShape} recommendations...`);
    if (colorSeason) {
      console.log(`🎨 Color Season: ${colorSeason}`);
    }
    console.log(`API Endpoint: ${this.config.apiEndpoint}`);
    console.log(`Shop Domain: ${this.config.shopDomain}`);

    const formData = new FormData();
    formData.append('storeDomain', this.config.shopDomain);
    formData.append('bodyShape', bodyShape);

    // Add color season if available
    if (colorSeason) {
      formData.append('colorSeason', colorSeason);
    }

    // Add settings from config
    if (this.config.settings) {
      formData.append('numberOfSuggestions', this.config.settings.numberOfSuggestions || 30);
      formData.append('minimumMatchScore', this.config.settings.minimumMatchScore || 30);
      // If scanAllProducts is true, send 0, otherwise use the limit
      const maxScan = this.config.settings.scanAllProducts !== false ? 0 : (this.config.settings.maxProductsToScan || 1000);
      formData.append('maxProductsToScan', maxScan);
      formData.append('onlyInStock', this.config.settings.onlyInStockProducts === true); // default false
      formData.append('enableImageAnalysis', this.config.settings.enableImageAnalysis === true); // default false
      console.log(`Settings: suggestions=${this.config.settings.numberOfSuggestions}, minScore=${this.config.settings.minimumMatchScore}, scanAll=${this.config.settings.scanAllProducts}, maxScan=${maxScan}, inStock=${this.config.settings.onlyInStockProducts}, imageAnalysis=${this.config.settings.enableImageAnalysis}`);
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

    // Add values preferences if questionnaire was completed
    if (this.valuesPreferences && this.valuesPreferences.completed) {
      formData.append('sustainability', this.valuesPreferences.sustainability);
      if (this.valuesPreferences.budgetRange) {
        formData.append('budgetRange', this.valuesPreferences.budgetRange);
      }
      if (this.valuesPreferences.styles && this.valuesPreferences.styles.length > 0) {
        formData.append('stylePreferences', this.valuesPreferences.styles.join(','));
      }
      console.log(`Added values: sustainability=${this.valuesPreferences.sustainability}, budget=${this.valuesPreferences.budgetRange || 'none'}, styles=${this.valuesPreferences.styles.join(',') || 'none'}`);
    } else {
      console.log(`Values preferences not completed - skipping`);
    }

    const apiUrl = `${this.config.apiEndpoint}/api/gemini/recommendations`;
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
    console.log(`Gemini API response:`, data);

    if (data.recommendations) {
      console.log(`✓ Transforming ${data.recommendations.length} Gemini recommendations`);
      // Transform Gemini API response to match expected format
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

    const colorSeasonText = this.colorSeasonResult ? ` & ${this.colorSeasonResult} Skin Color Season` : '';

    // Build profile summary - only show values if questionnaire was completed
    const hasValues = this.valuesPreferences && this.valuesPreferences.completed;
    const valuesText = hasValues ? ` + Your Shopping Values` : '';

    return `
      <div class="bsa-products">
        <div class="bsa-header">
          <h3>🛍️ Recommended for ${this.bodyShapeResult.shape}${colorSeasonText}</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('combinedResults')">
            ← Back to Style Profile
          </button>
        </div>

        ${this.colorSeasonResult || hasValues ? `
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; text-align: center;">
            <p style="margin: 0; font-size: 18px;">
              <strong>Your Profile:</strong> ${this.bodyShapeResult.shape} body shape${colorSeasonText}${valuesText}
            </p>
            ${hasValues ? `
              <p style="margin: 0.5rem 0 0 0; font-size: 14px; opacity: 0.9;">
                ${this.valuesPreferences.sustainability ? '🌱 Sustainable' : ''}
                ${this.valuesPreferences.budgetRange ? `💰 ${this.valuesPreferences.budgetRange}` : ''}
                ${this.valuesPreferences.styles.length > 0 ? `✨ ${this.valuesPreferences.styles.join(', ')}` : ''}
              </p>
            ` : ''}
          </div>
        ` : ''}

        ${products.length === 0 ? `
          <div class="bsa-loading">
            <div class="bsa-loading-spinner"></div>
            <h4>🤖 AI Fashion Stylist at Work...</h4>
            <p class="bsa-loading-message">Analyzing your ${this.bodyShapeResult.shape} body shape${colorSeasonText}${valuesText}</p>
            <p class="bsa-loading-submessage">Our AI is reviewing products to find your perfect match. This may take 10-30 seconds.</p>
            <div class="bsa-loading-steps">
              <div class="bsa-loading-step bsa-step-active">✓ Fetching products from catalog</div>
              <div class="bsa-loading-step bsa-step-active">✓ Filtering by body shape preferences</div>
              <div class="bsa-loading-step bsa-step-processing">⏳ Gemini AI analyzing matches...</div>
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

  renderColorSeasonPathSelection() {
    return `
      <div class="bsa-path-selection">
        <div class="bsa-header">
          <h3>🎨 Discover Your Skin Color Season</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('pathSelection')">← Back
        </div>

        <p style="text-align: center; color: #64748b; margin-bottom: 2rem; font-size: 16px;">
          How would you like to find your color season?
        </p>

        <div class="bsa-options">
          <div class="bsa-option">
            <div class="bsa-option-icon">📋</div>
            <h4>Take the Color Season Test</h4>
            <p>Answer 3 quick questions to discover your perfect color palette</p>
            <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.goToStep('colorSeason')">
              Start Color Test
            </button>
          </div>

          <div class="bsa-option">
            <div class="bsa-option-icon">✨</div>
            <h4>I Know My Color Season</h4>
            <p>Skip to recommendations if you already know your season</p>
            <button class="bsa-btn bsa-btn-secondary" onclick="bodyShapeAdvisor.goToStep('knownColorSeason')">
              Select My Season
            </button>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('pathSelection')">
            ← Back
          </button>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.skipColorSeason()">
            Skip →
          </button>
        </div>
      </div>
    `;
  }

  renderColorSeason() {
    return `
      <div class="bsa-color-season">
        <div class="bsa-header">
          <h3>🎨 Color Season Test</h3>
          <button class="bsa-btn bsa-btn-link" onclick="window.bodyShapeAdvisor.goToStep('colorSeasonPathSelection')">← Back</button>
        </div>

        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; text-align: center;">
          <p style="margin: 0; font-size: 16px; line-height: 1.5;">
            Find your perfect color palette with these 3 quick questions
          </p>
        </div>

        <form id="colorSeasonForm" onsubmit="window.bodyShapeAdvisor.handleColorSeasonSubmit(event)">

          <!-- Question 1: Skin Undertone -->
          <div class="bsa-form-section" style="background: #f9fafb; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; border-left: 4px solid #667eea;">
            <h4 style="color: #1f2937; margin-bottom: 0.75rem;">1️⃣ What's your skin undertone?</h4>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 1.25rem;">
              💡 Tip: Check your wrist veins or which jewelry flatters you more
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              <label class="bsa-radio-option" style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.2s;">
                <input type="radio" name="undertone" value="warm" required style="margin-right: 0.75rem;">
                <span style="font-size: 15px;"><strong>☀️ Warm</strong> — Green veins, gold jewelry looks best on me</span>
              </label>
              <label class="bsa-radio-option" style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.2s;">
                <input type="radio" name="undertone" value="cool" required style="margin-right: 0.75rem;">
                <span style="font-size: 15px;"><strong>❄️ Cool</strong> — Blue/purple veins, silver jewelry looks best on me</span>
              </label>
            </div>
          </div>

          <!-- Question 2: Hair & Eye Depth -->
          <div class="bsa-form-section" style="background: #f9fafb; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; border-left: 4px solid #667eea;">
            <h4 style="color: #1f2937; margin-bottom: 0.75rem;">2️⃣ How would you describe your natural coloring?</h4>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 1.25rem;">
              💡 Tip: Think about your natural hair and eye color
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              <label class="bsa-radio-option" style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.2s;">
                <input type="radio" name="depth" value="light" required style="margin-right: 0.75rem;">
                <span style="font-size: 15px;"><strong>🌤️ Light</strong> — Blonde or light brown hair, light colored eyes</span>
              </label>
              <label class="bsa-radio-option" style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.2s;">
                <input type="radio" name="depth" value="medium" required style="margin-right: 0.75rem;">
                <span style="font-size: 15px;"><strong>🌥️ Medium</strong> — Medium brown hair, hazel or green eyes</span>
              </label>
              <label class="bsa-radio-option" style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.2s;">
                <input type="radio" name="depth" value="deep" required style="margin-right: 0.75rem;">
                <span style="font-size: 15px;"><strong>🌑 Deep</strong> — Dark brown or black hair, dark eyes</span>
              </label>
            </div>
          </div>

          <!-- Question 3: Intensity -->
          <div class="bsa-form-section" style="background: #f9fafb; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; border-left: 4px solid #667eea;">
            <h4 style="color: #1f2937; margin-bottom: 0.75rem;">3️⃣ What colors make you look most vibrant?</h4>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 1.25rem;">
              💡 Tip: Think about which colors get you the most compliments
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              <label class="bsa-radio-option" style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.2s;">
                <input type="radio" name="intensity" value="bright" required style="margin-right: 0.75rem;">
                <span style="font-size: 15px;"><strong>✨ Bright</strong> — Saturated colors, jewel tones, vivid shades</span>
              </label>
              <label class="bsa-radio-option" style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.2s;">
                <input type="radio" name="intensity" value="muted" required style="margin-right: 0.75rem;">
                <span style="font-size: 15px;"><strong>🌫️ Soft & Muted</strong> — Pastels, dusty shades, subtle colors</span>
              </label>
            </div>
          </div>

          <button type="submit" class="bsa-btn bsa-btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 1rem; font-size: 16px; font-weight: 600;">
            Get My Skin Color Season & Product Recommendations
          </button>
        </form>
      </div>
    `;
  }

  renderKnownColorSeason() {
    const seasons = [
      {
        name: "Spring",
        icon: "🌸",
        desc: "Warm undertone, light/medium depth, bright colors",
        colors: "Peach, coral, light turquoise, warm pastels"
      },
      {
        name: "Summer",
        icon: "☀️",
        desc: "Cool undertone, light/medium depth, soft colors",
        colors: "Pastel blue, rose, lavender, cool pastels"
      },
      {
        name: "Autumn",
        icon: "🍂",
        desc: "Warm undertone, medium/deep depth, muted colors",
        colors: "Olive, mustard, terracotta, warm earth tones"
      },
      {
        name: "Winter",
        icon: "❄️",
        desc: "Cool undertone, deep depth, bright colors",
        colors: "Jewel tones, icy blue, black, pure white"
      }
    ];

    return `
      <div class="bsa-known-shape">
        <div class="bsa-header">
          <h3>Select Your Color Season</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('colorSeasonPathSelection')">
            ← Back
          </button>
        </div>

        <p style="text-align: center; color: #64748b; margin-bottom: 2rem;">Choose the color season that best describes you:</p>

        <div class="bsa-shape-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
          ${seasons.map(season => `
            <div class="bsa-shape-card" onclick="bodyShapeAdvisor.selectColorSeason('${season.name}')" style="cursor: pointer; padding: 1.5rem; background: white; border: 2px solid #e5e7eb; border-radius: 12px; transition: all 0.2s; text-align: center;">
              <div class="bsa-shape-icon" style="font-size: 3rem; margin-bottom: 1rem;">${season.icon}</div>
              <h4 style="color: #1f2937; margin-bottom: 0.5rem;">${season.name}</h4>
              <p style="color: #6b7280; font-size: 14px; margin-bottom: 0.75rem;">${season.desc}</p>
              <p style="color: #667eea; font-size: 13px; font-weight: 600;">Best: ${season.colors}</p>
            </div>
          `).join('')}
        </div>

        <div class="bsa-help" style="text-align: center; margin-top: 2rem;">
          <p>Not sure? <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('colorSeason')" style="color: #667eea; text-decoration: underline;">Take our color season test instead</button></p>
        </div>
      </div>
    `;
  }

  async selectColorSeason(seasonName) {
    // User directly selected their color season
    this.colorSeasonResult = seasonName;
    this.colorAnalysis = null; // No detailed analysis since user selected directly

    console.log(`User selected color season: ${seasonName}`);

    // Skip intermediate API call - go directly to values questionnaire
    // Analysis will be done in combined call after all quizzes
    this.goToStep('valuesQuestionnaire');
  }

  async handleColorSeasonSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const undertone = formData.get('undertone');
    const depth = formData.get('depth');
    const intensity = formData.get('intensity');

    this.colorAnalysis = {
      undertone,
      depth,
      intensity
    };

    // Determine color season
    this.colorSeasonResult = this.calculateColorSeason(undertone, depth, intensity);

    console.log(`Color Season Result: ${this.colorSeasonResult}`);

    // Skip intermediate API call - go directly to values questionnaire
    // Analysis will be done in combined call after all quizzes
    this.goToStep('valuesQuestionnaire');
  }

  calculateColorSeason(undertone, depth, intensity) {
    // Spring: Warm + Light/Medium + Bright
    if (undertone === 'warm' && (depth === 'light' || depth === 'medium') && intensity === 'bright') {
      return 'Spring';
    }

    // Autumn: Warm + Medium/Deep + Muted
    if (undertone === 'warm' && (depth === 'medium' || depth === 'deep') && intensity === 'muted') {
      return 'Autumn';
    }

    // Summer: Cool + Light/Medium + Muted
    if (undertone === 'cool' && (depth === 'light' || depth === 'medium') && intensity === 'muted') {
      return 'Summer';
    }

    // Winter: Cool + Deep + Bright
    if (undertone === 'cool' && depth === 'deep' && intensity === 'bright') {
      return 'Winter';
    }

    // Fallback logic for edge cases
    if (undertone === 'warm') {
      return intensity === 'bright' ? 'Spring' : 'Autumn';
    } else {
      return intensity === 'bright' ? 'Winter' : 'Summer';
    }
  }

  async getClaudeColorSeasonAnalysis(colorSeason, colorAnalysis) {
    // DEPRECATED: This function is no longer used
    // All analysis is now done in getCombinedAnalysis() after values questionnaire
    console.log('⚠️ getClaudeColorSeasonAnalysis is deprecated - use getCombinedAnalysis instead');
  }

  async getCombinedAnalysis() {
    console.log(`🤖 Getting combined Gemini AI analysis (body shape + color season + values + celebrity)...`);

    try {
      const apiUrl = `${this.config.apiEndpoint}/api/gemini/combined-analysis`;

      const requestBody = {
        bodyShape: this.bodyShapeResult.shape,
        measurements: this.measurements,
        colorSeason: this.colorSeasonResult,
        colorAnalysis: this.colorAnalysis || {},
        valuesPreferences: this.valuesPreferences,
        shop: this.config.shopDomain
      };

      console.log('📤 Sending combined analysis request:', requestBody);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error(`API error: ${response.status}`);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        return false;
      }

      const data = await response.json();

      if (data.success) {
        console.log('✅ Got combined Gemini AI analysis');

        // Store all analyses
        this.combinedAnalysis = {
          bodyShapeAnalysis: data.bodyShapeAnalysis,
          colorSeasonAnalysis: data.colorSeasonAnalysis,
          valuesAnalysis: data.valuesAnalysis,
          celebrityRecommendations: data.celebrityRecommendations
        };

        console.log('📊 Combined analysis data:', this.combinedAnalysis);
        return true;
      } else {
        console.error('❌ Combined analysis failed:', data);
        return false;
      }
    } catch (error) {
      console.error('❌ Error getting combined analysis:', error);
      return false;
    }
  }

  renderColorSeasonResults() {
    if (!this.colorSeasonResult) return '';

    const claudeAnalysis = this.colorSeasonData?.claudeAnalysis;

    return `
      <div class="bsa-results">
        <div class="bsa-header">
          <h3>Your Skin Color Season Results</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('results')">
            ← Back to Body Shape
          </button>
        </div>

        <div class="bsa-result-card">
          <div class="bsa-result-header">
            <h4>${this.colorSeasonResult} Season</h4>
            <span class="bsa-confidence">Perfect match</span>
          </div>
          <p>Your unique coloring falls into the ${this.colorSeasonResult} season category</p>
        </div>

        ${claudeAnalysis ? `
          <div class="bsa-recommendations bsa-claude-analysis">
            <h4>🤖 AI Color Specialist Analysis</h4>

            ${claudeAnalysis.analysis ? `
              <div class="bsa-analysis-section">
                <p style="line-height: 1.6; color: #374151; white-space: pre-line;">${claudeAnalysis.analysis}</p>
              </div>
            ` : ''}

            ${claudeAnalysis.bestColors && claudeAnalysis.bestColors.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #4f46e5; margin-top: 1.5rem;">Your Best Colors</h5>
                <ul style="padding-left: 1.5rem;">
                  ${claudeAnalysis.bestColors.map(color => `<li style="margin: 0.5rem 0;">${color}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${claudeAnalysis.colorPalette && claudeAnalysis.colorPalette.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #4f46e5; margin-top: 1.5rem;">Color Palette by Category</h5>
                ${claudeAnalysis.colorPalette.map(palette => `
                  <div style="margin: 1.5rem 0; padding: 1rem; background: #f9fafb; border-radius: 8px; border-left: 4px solid #4f46e5;">
                    <h6 style="color: #1f2937; margin: 0 0 0.5rem 0; font-weight: 600;">${palette.category}</h6>
                    <ul style="padding-left: 1.5rem; margin: 0.5rem 0;">
                      ${palette.colors.map(color => `<li style="margin: 0.25rem 0;">${color}</li>`).join('')}
                    </ul>
                    <p style="margin: 0.75rem 0 0 0; color: #6b7280; font-style: italic;"><strong>Why:</strong> ${palette.reasoning}</p>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${claudeAnalysis.avoidColors && claudeAnalysis.avoidColors.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #dc2626; margin-top: 1.5rem;">Colors to Avoid</h5>
                <div style="background: #fef2f2; padding: 1rem; border-radius: 8px; border-left: 4px solid #dc2626;">
                  ${claudeAnalysis.avoidColors.map(avoid => `
                    <p style="margin: 0.5rem 0;"><strong>${avoid.color}:</strong> ${avoid.reason}</p>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${claudeAnalysis.stylingTips && claudeAnalysis.stylingTips.length > 0 ? `
              <div class="bsa-analysis-section">
                <h5 style="color: #059669; margin-top: 1.5rem;">Styling Tips</h5>
                <ul style="padding-left: 1.5rem;">
                  ${claudeAnalysis.stylingTips.map(tip => `<li style="margin: 0.5rem 0; color: #374151;">${tip}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="bsa-recommendations">
            <h4>Color Recommendations for ${this.colorSeasonResult} Season</h4>
            <p>Your personalized color palette analysis is being prepared...</p>
          </div>
        `}

        <div class="bsa-next-steps">
          <h4>🛍️ Ready to Shop?</h4>
          <p>Browse products that match both your ${this.bodyShapeResult.shape} body shape and ${this.colorSeasonResult} skin color season!</p>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.goToStep('valuesQuestionnaire')" style="flex: 1; min-width: 200px;">
              Continue to Shopping Preferences
            </button>
            <button class="bsa-btn bsa-btn-secondary" onclick="bodyShapeAdvisor.getProductsAfterColorSeason()" style="flex: 1; min-width: 200px;">
              Skip to Products
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderValuesQuestionnaire() {
    // Determine the back button destination
    const backStep = this.colorSeasonResult ? 'colorSeasonResults' : 'results';

    return `
      <div class="bsa-values-questionnaire">
        <div class="bsa-header">
          <h3>📋 Shopping Preferences & Values</h3>
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.goToStep('${backStep}')">
            ← Back
          </button>
        </div>

        <p style="color: #6b7280; margin-bottom: 2rem;">
          Help us refine your recommendations by sharing your shopping values and style preferences.
        </p>

        <form class="bsa-form" onsubmit="bodyShapeAdvisor.handleValuesSubmit(event)">
          <div class="bsa-form-section">
            <h4>🌱 Sustainability</h4>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 1rem;">
              Do you prefer sustainable and eco-friendly fashion?
            </p>
            <div class="bsa-form-field">
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input
                  type="checkbox"
                  name="sustainability"
                  value="true"
                  ${this.valuesPreferences.sustainability ? 'checked' : ''}
                  style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;"
                />
                <span>Yes, prioritize sustainable and eco-friendly products</span>
              </label>
            </div>
          </div>

          <div class="bsa-form-section">
            <h4>💰 Budget Range</h4>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 1rem;">
              What's your typical spending range per item?
            </p>
            <div class="bsa-form-field">
              <select name="budgetRange" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px;">
                <option value="low" ${this.valuesPreferences.budgetRange === 'low' ? 'selected' : ''}>Budget-Friendly (Under $${this.budgetSettings.budgetLowMax})</option>
                <option value="medium" ${!this.valuesPreferences.budgetRange || this.valuesPreferences.budgetRange === 'medium' ? 'selected' : ''}>Mid-Range ($${this.budgetSettings.budgetLowMax}-$${this.budgetSettings.budgetMediumMax})</option>
                <option value="high" ${this.valuesPreferences.budgetRange === 'high' ? 'selected' : ''}>Premium ($${this.budgetSettings.budgetMediumMax}-$${this.budgetSettings.budgetHighMax})</option>
                <option value="luxury" ${this.valuesPreferences.budgetRange === 'luxury' ? 'selected' : ''}>Luxury ($${this.budgetSettings.budgetHighMax}+)</option>
              </select>
            </div>
          </div>

          <div class="bsa-form-section">
            <h4>✨ Style Preferences</h4>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 1rem;">
              Select all styles that resonate with you (optional):
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input
                  type="checkbox"
                  name="styles"
                  value="minimalist"
                  ${this.valuesPreferences.styles.includes('minimalist') ? 'checked' : ''}
                  style="margin-right: 0.5rem; width: 16px; height: 16px; cursor: pointer;"
                />
                <span>Minimalist</span>
              </label>
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input
                  type="checkbox"
                  name="styles"
                  value="classic"
                  ${this.valuesPreferences.styles.includes('classic') ? 'checked' : ''}
                  style="margin-right: 0.5rem; width: 16px; height: 16px; cursor: pointer;"
                />
                <span>Classic</span>
              </label>
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input
                  type="checkbox"
                  name="styles"
                  value="trendy"
                  ${this.valuesPreferences.styles.includes('trendy') ? 'checked' : ''}
                  style="margin-right: 0.5rem; width: 16px; height: 16px; cursor: pointer;"
                />
                <span>Trendy</span>
              </label>
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input
                  type="checkbox"
                  name="styles"
                  value="bohemian"
                  ${this.valuesPreferences.styles.includes('bohemian') ? 'checked' : ''}
                  style="margin-right: 0.5rem; width: 16px; height: 16px; cursor: pointer;"
                />
                <span>Bohemian</span>
              </label>
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input
                  type="checkbox"
                  name="styles"
                  value="edgy"
                  ${this.valuesPreferences.styles.includes('edgy') ? 'checked' : ''}
                  style="margin-right: 0.5rem; width: 16px; height: 16px; cursor: pointer;"
                />
                <span>Edgy</span>
              </label>
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input
                  type="checkbox"
                  name="styles"
                  value="romantic"
                  ${this.valuesPreferences.styles.includes('romantic') ? 'checked' : ''}
                  style="margin-right: 0.5rem; width: 16px; height: 16px; cursor: pointer;"
                />
                <span>Romantic</span>
              </label>
            </div>
          </div>

          <button type="submit" class="bsa-btn bsa-btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 1rem; font-size: 16px; font-weight: 600;">
            Get My Personalized Recommendations
          </button>
        </form>

        <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 1rem;">
          <button class="bsa-btn bsa-btn-link" onclick="bodyShapeAdvisor.skipValues()">
            Skip →
          </button>
        </div>
      </div>
    `;
  }

  renderCombinedAnalysisLoading() {
    return `
      <div class="bsa-loading" style="text-align: center; padding: 3rem;">
        <div class="bsa-spinner" style="margin: 0 auto 2rem;"></div>
        <h3 style="margin-bottom: 1rem;">✨ Creating Your Complete Style Profile...</h3>
        <p style="color: #6b7280; font-size: 14px; max-width: 500px; margin: 0 auto;">
          Our AI is analyzing your body shape, color season, and personal values to create a comprehensive style guide just for you...
        </p>
      </div>
    `;
  }

  renderCombinedResults() {
    if (!this.combinedAnalysis) {
      return '<div class="bsa-error">Analysis data not available</div>';
    }

    const { bodyShapeAnalysis, colorSeasonAnalysis, valuesAnalysis, celebrityRecommendations } = this.combinedAnalysis;

    return `
      <div class="bsa-combined-results">
        <div class="bsa-header" style="text-align: center; margin-bottom: 2rem;">
          <h2 style="font-size: 2rem; margin-bottom: 0.5rem;">✨ Your Complete Style Profile</h2>
          <p style="color: #6b7280;">A comprehensive guide based on your unique measurements, coloring, and values</p>
        </div>

        <!-- Body Shape Analysis Section -->
        <div class="bsa-analysis-card" style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="color: #4f46e5; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.5rem;">👗</span>
            Your Body Shape: ${this.bodyShapeResult.shape}
          </h3>

          ${bodyShapeAnalysis.analysis ? `
            <div class="bsa-section" style="margin-bottom: 1.5rem;">
              <p style="line-height: 1.6; color: #374151; white-space: pre-line;">${bodyShapeAnalysis.analysis}</p>
            </div>
          ` : ''}

          ${bodyShapeAnalysis.styleGoals && bodyShapeAnalysis.styleGoals.length > 0 ? `
            <div class="bsa-section" style="margin-bottom: 1.5rem;">
              <h4 style="color: #1f2937; margin-bottom: 0.75rem;">Style Goals:</h4>
              <ul style="padding-left: 1.5rem;">
                ${bodyShapeAnalysis.styleGoals.map(goal => `<li style="margin: 0.5rem 0; line-height: 1.5;">${goal}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${bodyShapeAnalysis.recommendations && bodyShapeAnalysis.recommendations.length > 0 ? `
            <div class="bsa-section" style="margin-bottom: 1.5rem;">
              <h4 style="color: #1f2937; margin-bottom: 0.75rem;">What to Wear:</h4>
              ${bodyShapeAnalysis.recommendations.map(rec => `
                <div style="margin: 1rem 0; padding: 1rem; background: #f9fafb; border-radius: 8px; border-left: 4px solid #4f46e5;">
                  <h5 style="color: #1f2937; margin-bottom: 0.5rem;">${rec.category}</h5>
                  <ul style="padding-left: 1.5rem; margin: 0.5rem 0;">
                    ${rec.items.map(item => `<li style="margin: 0.25rem 0;">${item}</li>`).join('')}
                  </ul>
                  <p style="margin: 0.75rem 0 0 0; color: #6b7280; font-style: italic;"><strong>Why:</strong> ${rec.reasoning}</p>
                  ${rec.stylingTips ? `<p style="margin: 0.5rem 0 0 0; color: #059669;"><strong>Tip:</strong> ${rec.stylingTips}</p>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${bodyShapeAnalysis.proTips && bodyShapeAnalysis.proTips.length > 0 ? `
            <div class="bsa-section">
              <h4 style="color: #1f2937; margin-bottom: 0.75rem;">Pro Tips:</h4>
              <ul style="padding-left: 1.5rem;">
                ${bodyShapeAnalysis.proTips.map(tip => `<li style="margin: 0.5rem 0; line-height: 1.5; color: #059669;">${tip}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>

        <!-- Color Season Analysis Section -->
        <div class="bsa-analysis-card" style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="color: #db2777; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.5rem;">🎨</span>
            Your Color Season: ${this.colorSeasonResult}
          </h3>

          ${colorSeasonAnalysis.analysis ? `
            <div class="bsa-section" style="margin-bottom: 1.5rem;">
              <p style="line-height: 1.6; color: #374151; white-space: pre-line;">${colorSeasonAnalysis.analysis}</p>
            </div>
          ` : ''}

          ${colorSeasonAnalysis.bestColors && colorSeasonAnalysis.bestColors.length > 0 ? `
            <div class="bsa-section" style="margin-bottom: 1.5rem;">
              <h4 style="color: #1f2937; margin-bottom: 0.75rem;">Your Best Colors:</h4>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                ${colorSeasonAnalysis.bestColors.map(color => `
                  <span style="background: #fdf2f8; color: #db2777; padding: 0.5rem 1rem; border-radius: 20px; font-weight: 500;">${color}</span>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${colorSeasonAnalysis.colorPalette && colorSeasonAnalysis.colorPalette.length > 0 ? `
            <div class="bsa-section" style="margin-bottom: 1.5rem;">
              <h4 style="color: #1f2937; margin-bottom: 0.75rem;">Color Palette by Category:</h4>
              ${colorSeasonAnalysis.colorPalette.map(palette => `
                <div style="margin: 1rem 0; padding: 1rem; background: #f9fafb; border-radius: 8px; border-left: 4px solid #db2777;">
                  <h5 style="color: #1f2937; margin-bottom: 0.5rem;">${palette.category}</h5>
                  <ul style="padding-left: 1.5rem; margin: 0.5rem 0;">
                    ${palette.colors.map(color => `<li style="margin: 0.25rem 0;">${color}</li>`).join('')}
                  </ul>
                  <p style="margin: 0.75rem 0 0 0; color: #6b7280; font-style: italic;"><strong>Why:</strong> ${palette.reasoning}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${colorSeasonAnalysis.stylingTips && colorSeasonAnalysis.stylingTips.length > 0 ? `
            <div class="bsa-section">
              <h4 style="color: #1f2937; margin-bottom: 0.75rem;">Color Styling Tips:</h4>
              <ul style="padding-left: 1.5rem;">
                ${colorSeasonAnalysis.stylingTips.map(tip => `<li style="margin: 0.5rem 0; line-height: 1.5; color: #db2777;">${tip}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>

        <!-- Values Analysis Section -->
        ${valuesAnalysis ? `
          <div class="bsa-analysis-card" style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="color: #059669; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.5rem;">💚</span>
              Your Shopping Values & Style
            </h3>

            ${valuesAnalysis.analysis ? `
              <div class="bsa-section" style="margin-bottom: 1.5rem;">
                <p style="line-height: 1.6; color: #374151; white-space: pre-line;">${valuesAnalysis.analysis}</p>
              </div>
            ` : ''}

            ${valuesAnalysis.recommendedBrands && valuesAnalysis.recommendedBrands.length > 0 ? `
              <div class="bsa-section" style="margin-bottom: 1.5rem;">
                <h4 style="color: #1f2937; margin-bottom: 0.75rem;">Brands & Strategies for You:</h4>
                <ul style="padding-left: 1.5rem;">
                  ${valuesAnalysis.recommendedBrands.map(brand => `<li style="margin: 0.5rem 0; line-height: 1.5;">${brand}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${valuesAnalysis.balancingTips && valuesAnalysis.balancingTips.length > 0 ? `
              <div class="bsa-section">
                <h4 style="color: #1f2937; margin-bottom: 0.75rem;">Smart Shopping Tips:</h4>
                <ul style="padding-left: 1.5rem;">
                  ${valuesAnalysis.balancingTips.map(tip => `<li style="margin: 0.5rem 0; line-height: 1.5; color: #059669;">${tip}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Celebrity Recommendations Section -->
        ${celebrityRecommendations && celebrityRecommendations.celebrities && celebrityRecommendations.celebrities.length > 0 ? `
          <div class="bsa-analysis-card" style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="color: #f59e0b; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.5rem;">⭐</span>
              Your Celebrity Style Icons
            </h3>

            ${celebrityRecommendations.summary ? `
              <p style="color: #6b7280; margin-bottom: 1.5rem; line-height: 1.6;">${celebrityRecommendations.summary}</p>
            ` : ''}

            <div style="display: grid; gap: 1.5rem;">
              ${celebrityRecommendations.celebrities.map((celeb, index) => `
                <div style="display: grid; grid-template-columns: 150px 1fr; gap: 1.5rem; padding: 1.5rem; background: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b;">
                  <!-- Celebrity Image -->
                  <div id="celebrity-image-${index}" class="bsa-celebrity-image" style="width: 150px; height: 150px; border-radius: 8px; overflow: hidden; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); display: flex; align-items: center; justify-content: center;">
                    <div style="text-align: center; padding: 1rem;">
                      <div style="font-size: 3rem; margin-bottom: 0.5rem;">⭐</div>
                      <div style="font-size: 12px; font-weight: 600; color: white; line-height: 1.2;">${celeb.name}</div>
                    </div>
                  </div>

                  <!-- Celebrity Details -->
                  <div>
                    <h4 style="color: #1f2937; margin-bottom: 0.5rem; font-size: 1.125rem;">${celeb.name}</h4>
                    <p style="color: #6b7280; margin-bottom: 1rem; font-style: italic;">${celeb.matchReason}</p>

                    ${celeb.stylingTips && celeb.stylingTips.length > 0 ? `
                      <div style="margin-bottom: 1rem;">
                        <strong style="color: #1f2937;">Styling Tips:</strong>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem;">
                          ${celeb.stylingTips.map(tip => `<li style="margin: 0.25rem 0; color: #374151;">${tip}</li>`).join('')}
                        </ul>
                      </div>
                    ` : ''}

                    ${celeb.signaturePieces && celeb.signaturePieces.length > 0 ? `
                      <div>
                        <strong style="color: #1f2937;">Signature Pieces:</strong>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem;">
                          ${celeb.signaturePieces.map(piece => `<li style="margin: 0.25rem 0; color: #374151;">${piece}</li>`).join('')}
                        </ul>
                      </div>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Call to Action -->
        <div style="text-align: center; margin-top: 2rem;">
          <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.browseProducts()" style="padding: 1rem 2rem; font-size: 1.125rem; font-weight: 600;">
            🛍️ Show Me Perfect Products!
          </button>
        </div>
      </div>
    `;
  }

  renderStyleSummary() {
    // Load celebrity recommendations if not already loaded
    if (!this.celebrityRecommendations) {
      this.loadCelebrityRecommendations();
      return `
        <div class="bsa-loading">
          <div class="bsa-spinner"></div>
          <p>Creating your personalized style profile...</p>
        </div>
      `;
    }

    const budgetLabels = {
      low: `Budget-Friendly (Under $${this.budgetSettings.budgetLowMax})`,
      medium: `Mid-Range ($${this.budgetSettings.budgetLowMax}-$${this.budgetSettings.budgetMediumMax})`,
      high: `Premium ($${this.budgetSettings.budgetMediumMax}-$${this.budgetSettings.budgetHighMax})`,
      luxury: `Luxury ($${this.budgetSettings.budgetHighMax}+)`
    };

    return `
      <div class="bsa-style-summary">
        <div class="bsa-header">
          <h3>✨ Your Personal Style Profile</h3>
        </div>

        <!-- Profile Summary -->
        <div class="bsa-profile-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem;">
          <h4 style="color: white; margin-bottom: 1rem; font-size: 1.25rem;">Your Unique Style Identity</h4>
          <p style="font-size: 1.05rem; line-height: 1.6; opacity: 0.95;">
            ${this.celebrityRecommendations.summary}
          </p>
        </div>

        <!-- Quick Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
          <div class="bsa-stat-card">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👗</div>
            <div style="font-weight: 600; margin-bottom: 0.25rem;">${this.bodyShapeResult.shape}</div>
            <div style="color: #6b7280; font-size: 14px;">Body Shape</div>
          </div>
          ${this.colorSeasonResult ? `
            <div class="bsa-stat-card">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎨</div>
              <div style="font-weight: 600; margin-bottom: 0.25rem;">${this.colorSeasonResult}</div>
              <div style="color: #6b7280; font-size: 14px;">Color Season</div>
            </div>
          ` : ''}
          <div class="bsa-stat-card">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">💰</div>
            <div style="font-weight: 600; margin-bottom: 0.25rem;">${budgetLabels[this.valuesPreferences.budgetRange] || 'Not Set'}</div>
            <div style="color: #6b7280; font-size: 14px;">Budget Range</div>
          </div>
          ${this.valuesPreferences.styles.length > 0 ? `
            <div class="bsa-stat-card">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">✨</div>
              <div style="font-weight: 600; margin-bottom: 0.25rem;">${this.valuesPreferences.styles.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}</div>
              <div style="color: #6b7280; font-size: 14px;">Style Preferences</div>
            </div>
          ` : ''}
        </div>

        <!-- Celebrity Style Icons -->
        <div class="bsa-celebrities-section" style="margin-bottom: 2rem;">
          <h4 style="margin-bottom: 1.5rem; font-size: 1.5rem; text-align: center;">🌟 Your Celebrity Style Icons</h4>
          <p style="color: #6b7280; text-align: center; margin-bottom: 2rem;">These celebrities share your body shape${this.colorSeasonResult ? ' and color season' : ''}, making them perfect style inspiration!</p>

          <div style="display: grid; gap: 2rem;">
            ${this.celebrityRecommendations.celebrities.map((celeb, index) => `
              <div class="bsa-celebrity-card" style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="display: flex; gap: 1.5rem; align-items: start; flex-wrap: wrap;">
                  <div style="flex-shrink: 0;">
                    <div id="celeb-img-${index}" class="bsa-celebrity-image" data-celebrity-name="${encodeURIComponent(celeb.name)}" style="width: 150px; height: 150px; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; position: relative;">
                      <div style="font-size: 3rem; margin-bottom: 0.5rem;">⭐</div>
                      <div style="font-size: 14px; font-weight: 600; color: white; line-height: 1.2;">Loading...</div>
                    </div>
                  </div>
                  <div style="flex: 1; min-width: 250px;">
                    <h5 style="font-size: 1.25rem; margin-bottom: 0.5rem; color: #1f2937;">${celeb.name}</h5>
                    <p style="color: #4b5563; margin-bottom: 1rem; line-height: 1.6;">${celeb.matchReason}</p>

                    <div style="margin-bottom: 1rem;">
                      <div style="font-weight: 600; color: #374151; margin-bottom: 0.5rem; font-size: 14px;">💡 Styling Tips:</div>
                      <ul style="margin: 0; padding-left: 1.5rem; color: #6b7280;">
                        ${celeb.stylingTips.map(tip => `<li style="margin-bottom: 0.25rem;">${tip}</li>`).join('')}
                      </ul>
                    </div>

                    <div>
                      <div style="font-weight: 600; color: #374151; margin-bottom: 0.5rem; font-size: 14px;">🛍️ Signature Pieces:</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${celeb.signaturePieces.map(piece => `
                          <span style="background: #f3f4f6; padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 13px; color: #4b5563;">
                            ${piece}
                          </span>
                        `).join('')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Call to Action -->
        <div style="text-align: center; padding: 2rem 0;">
          <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.continueToProducts()" style="padding: 1rem 3rem; font-size: 1.1rem; font-weight: 600;">
            Browse Products Curated For You →
          </button>
          <p style="color: #6b7280; margin-top: 1rem; font-size: 14px;">Ready to find clothes that match your unique style profile</p>
        </div>
      </div>
    `;
  }

  async loadCelebrityRecommendations() {
    try {
      const params = new URLSearchParams({
        bodyShape: this.bodyShapeResult.shape,
        shop: this.config.shopDomain
      });

      // Add all measurements for personalized recommendations and size advice
      if (this.measurements.gender) {
        params.append('gender', this.measurements.gender);
      }
      if (this.measurements.age) {
        params.append('age', this.measurements.age);
      }
      if (this.measurements.height) {
        params.append('height', this.measurements.height);
      }
      if (this.measurements.weight) {
        params.append('weight', this.measurements.weight);
      }
      if (this.measurements.bust) {
        params.append('bust', this.measurements.bust);
      }
      if (this.measurements.waist) {
        params.append('waist', this.measurements.waist);
      }
      if (this.measurements.hips) {
        params.append('hips', this.measurements.hips);
      }
      if (this.measurements.shoulders) {
        params.append('shoulders', this.measurements.shoulders);
      }

      if (this.colorSeasonResult) {
        params.append('colorSeason', this.colorSeasonResult);
      }

      if (this.valuesPreferences.styles.length > 0) {
        params.append('styles', this.valuesPreferences.styles.join(','));
      }

      const response = await fetch(`${this.config.apiEndpoint}/api/celebrity-recommendations?${params}`);
      const result = await response.json();

      if (result.success) {
        this.celebrityRecommendations = result.data;
        this.render(); // Re-render with the data
        this.loadCelebrityImages(); // Load actual celebrity images
      } else {
        console.error('Failed to load celebrity recommendations:', result.error);
        // Provide fallback
        this.celebrityRecommendations = {
          summary: `You have a ${this.bodyShapeResult.shape} body shape${this.colorSeasonResult ? ` with ${this.colorSeasonResult} coloring` : ''}. This unique combination makes you perfect for a variety of stylish looks!`,
          celebrities: [{
            name: 'Style Icon',
            matchReason: 'Fashion experts recommend focusing on pieces that complement your body shape.',
            stylingTips: [
              'Choose clothing that flatters your natural proportions',
              'Experiment with different styles to find what makes you feel confident',
              'Focus on fit and quality over trends'
            ],
            signaturePieces: this.bodyShapeResult.keyPieces || [],

          }]
        };
        this.render();
      }
    } catch (error) {
      console.error('Error loading celebrity recommendations:', error);
      // Provide fallback
      this.celebrityRecommendations = {
        summary: `You have a ${this.bodyShapeResult.shape} body shape${this.colorSeasonResult ? ` with ${this.colorSeasonResult} coloring` : ''}. This unique combination makes you perfect for a variety of stylish looks!`,
        celebrities: [{
          name: 'Style Icon',
          matchReason: 'Fashion experts recommend focusing on pieces that complement your body shape.',
          stylingTips: [
            'Choose clothing that flatters your natural proportions',
            'Experiment with different styles to find what makes you feel confident',
            'Focus on fit and quality over trends'
          ],
          signaturePieces: this.bodyShapeResult.keyPieces || [],

        }]
      };
      this.render();
    }
  }

  async loadCelebrityImages() {
    if (!this.combinedAnalysis?.celebrityRecommendations?.celebrities) {
      // Fallback to old property for backward compatibility
      if (!this.celebrityRecommendations || !this.celebrityRecommendations.celebrities) return;
    }

    const celebrities = this.combinedAnalysis?.celebrityRecommendations?.celebrities || this.celebrityRecommendations.celebrities;

    // Load Wikipedia images for each celebrity
    celebrities.forEach(async (celeb, index) => {
      // Support both old and new ID formats
      const container = document.getElementById(`celebrity-image-${index}`) || document.getElementById(`celeb-img-${index}`);
      if (!container) return;

      try {
        console.log(`🖼️ Loading image for: ${celeb.name}`);

        // First, try direct title lookup
        let searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(celeb.name)}&prop=pageimages&pithumbsize=300`;
        let response = await fetch(searchUrl);
        let data = await response.json();

        let pages = data.query.pages;
        let pageId = Object.keys(pages)[0];
        let imageUrl = pages[pageId]?.thumbnail?.source;

        console.log(`📄 Direct lookup result for ${celeb.name}:`, { pageId, hasImage: !!imageUrl });

        // If no image found, try Wikipedia search as fallback
        if (!imageUrl || pageId === '-1') {
          console.log(`🔍 Trying search fallback for: ${celeb.name}`);

          // Use Wikipedia search to find the correct article
          const searchApiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(celeb.name)}&srlimit=1`;
          const searchResponse = await fetch(searchApiUrl);
          const searchData = await searchResponse.json();

          if (searchData.query.search.length > 0) {
            const correctTitle = searchData.query.search[0].title;
            console.log(`✓ Found Wikipedia article: "${correctTitle}"`);

            // Now fetch the image using the correct title
            const imageApiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(correctTitle)}&prop=pageimages&pithumbsize=300`;
            const imageResponse = await fetch(imageApiUrl);
            const imageData = await imageResponse.json();

            const imagePages = imageData.query.pages;
            const imagePageId = Object.keys(imagePages)[0];
            imageUrl = imagePages[imagePageId]?.thumbnail?.source;

            console.log(`📸 Search fallback result:`, { pageId: imagePageId, hasImage: !!imageUrl });
          }
        }

        if (imageUrl) {
          console.log(`✅ Successfully loaded image for ${celeb.name}`);
          // Replace placeholder with actual image
          container.innerHTML = `
            <img src="${imageUrl}"
                 alt="${celeb.name}"
                 style="width: 100%; height: 100%; object-fit: cover;"
                 onerror="this.parentElement.innerHTML='<div style=\\'text-align: center; padding: 1rem;\\'><div style=\\'font-size: 3rem;\\'>⭐</div><div style=\\'font-size: 14px; font-weight: 600; color: white;\\'>${celeb.name}</div></div>'">
          `;
        } else {
          console.log(`⚠️ No image found for ${celeb.name}, showing placeholder`);
          // No image found, show nice placeholder
          container.innerHTML = `
            <div style="text-align: center; padding: 1rem;">
              <div style="font-size: 3rem; margin-bottom: 0.5rem;">⭐</div>
              <div style="font-size: 14px; font-weight: 600; color: white; line-height: 1.2;">${celeb.name}</div>
            </div>
          `;
        }
      } catch (error) {
        console.error(`❌ Failed to load image for ${celeb.name}:`, error);
        // Show placeholder on error
        container.innerHTML = `
          <div style="text-align: center; padding: 1rem;">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">⭐</div>
            <div style="font-size: 14px; font-weight: 600; color: white; line-height: 1.2;">${celeb.name}</div>
          </div>
        `;
      }
    });
  }

  continueToProducts() {
    // Check if we have color season data
    if (this.colorSeasonResult) {
      // User went through color season analysis
      this.getProductsAfterColorSeason();
    } else {
      // User skipped color season, just use body shape
      this.browseProducts();
    }
  }

  skipBodyShape() {
    console.log('⏭️ User skipped body shape analysis');
    this.bodyShapeResult = null;
    this.measurements = {};
    this.goToStep('colorSeasonPathSelection');
  }

  skipColorSeason() {
    console.log('⏭️ User skipped color season analysis');
    this.colorSeasonResult = null;
    this.colorAnalysis = {};
    this.goToStep('valuesQuestionnaire');
  }

  skipValues() {
    console.log('⏭️ User skipped values questionnaire');
    this.valuesPreferences = {
      sustainability: false,
      budgetRange: 'medium',
      styles: [],
      completed: false
    };

    // Check if user skipped everything
    if (!this.bodyShapeResult && !this.colorSeasonResult) {
      this.showInsufficientDataError();
    } else {
      this.proceedToRecommendations();
    }
  }

  showInsufficientDataError() {
    this.currentStep = 'insufficientData';
    this.render();
  }

  renderInsufficientData() {
    return `
      <div style="text-align: center; padding: 3rem; max-width: 600px; margin: 0 auto;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">😔</div>
        <h3 style="color: #1f2937; margin-bottom: 1rem;">We Need More Information</h3>
        <p style="color: #6b7280; margin-bottom: 2rem; line-height: 1.6;">
          Sorry! We can't provide personalized recommendations without any data.
          Please complete at least one of the quizzes (Body Shape or Color Season)
          to get tailored product suggestions.
        </p>
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <button class="bsa-btn bsa-btn-primary" onclick="bodyShapeAdvisor.goToStep('welcome')">
            Start Over
          </button>
          <button class="bsa-btn bsa-btn-secondary" onclick="bodyShapeAdvisor.goToStep('pathSelection')">
            Take Body Shape Quiz
          </button>
        </div>
      </div>
    `;
  }

  proceedToRecommendations() {
    // If we have body shape or color season, proceed to combined analysis
    if (this.bodyShapeResult || this.colorSeasonResult) {
      this.currentStep = 'combinedAnalysisLoading';
      this.render();

      // Get combined analysis with whatever data we have
      this.getCombinedAnalysis().then(success => {
        if (success) {
          this.goToStep('combinedResults');
          this.loadCelebrityImages();
        } else {
          console.log('⚠️ Analysis failed, going to products directly');
          this.goToStep('products');
        }
      });
    } else {
      // No data at all - show error
      this.showInsufficientDataError();
    }
  }

  async handleValuesSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    // Get sustainability preference
    this.valuesPreferences.sustainability = formData.get('sustainability') === 'true';

    // Get budget range
    this.valuesPreferences.budgetRange = formData.get('budgetRange');

    // Get style preferences (multiple checkboxes)
    this.valuesPreferences.styles = formData.getAll('styles');

    // Mark questionnaire as completed
    this.valuesPreferences.completed = true;

    console.log('✅ Values preferences:', this.valuesPreferences);
    console.log('📊 Body shape:', this.bodyShapeResult.shape);
    console.log('🎨 Color season:', this.colorSeasonResult);

    // Show loading screen while getting combined Gemini AI analysis
    this.currentStep = 'combinedAnalysisLoading';
    this.render();

    // Get combined analysis (body shape + color season + values + celebrity)
    const success = await this.getCombinedAnalysis();

    if (success) {
      // Go to combined results page
      this.goToStep('combinedResults');
      // Load celebrity images after rendering
      this.loadCelebrityImages();
    } else {
      // If analysis fails, go to products directly
      console.log('⚠️ Analysis failed, going to products directly');
      this.goToStep('products');
    }
  }

  attachEventListeners() {
    // Event listeners are handled via onclick attributes for simplicity
  }
}

// Initialize immediately (script is loaded dynamically after DOM is ready)
(function() {
  const container = document.getElementById('body-shape-advisor-app');
  if (container && window.BodyShapeAdvisorConfig) {
    console.log('🚀 Initializing Body Shape Advisor...');
    window.bodyShapeAdvisor = new BodyShapeAdvisor('body-shape-advisor-app', window.BodyShapeAdvisorConfig);
    console.log('✅ Body Shape Advisor initialized successfully');
  } else {
    console.error('❌ Failed to initialize: container or config missing', {
      container: !!container,
      config: !!window.BodyShapeAdvisorConfig
    });
  }
})();