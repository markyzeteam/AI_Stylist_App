export interface BodyMeasurements {
  gender: string;
  age: string;
  height: number;
  weight: number;
  bust: number;
  waist: number;
  hips: number;
  shoulders: number;
  unit: 'metric' | 'imperial';
}

export interface BodyShapeResult {
  shape: string;
  description: string;
  confidence: number;
  characteristics: string[];
  recommendations: string[];
}

// Convert imperial to metric if needed
const normalizeUnit = (measurement: number, unit: 'metric' | 'imperial', type: 'length' | 'weight'): number => {
  if (unit === 'imperial') {
    if (type === 'length') {
      return measurement * 2.54; // inches to cm
    } else {
      return measurement * 0.453592; // lbs to kg
    }
  }
  return measurement;
};

// Body shape calculation for women/feminine bodies
const calculateFeminineBodyShape = (bust: number, waist: number, hips: number, shoulders: number): BodyShapeResult => {
  const bustWaistDiff = bust - waist;
  const hipWaistDiff = hips - waist;
  const shoulderHipDiff = Math.abs(shoulders - hips);
  const bustHipDiff = Math.abs(bust - hips);

  // Calculate ratios for more precise classification
  const waistHipRatio = waist / hips;
  const bustHipRatio = bust / hips;
  const shoulderHipRatio = shoulders / hips;

  // Pear/Triangle (hips significantly larger than bust)
  if (hipWaistDiff > 7 && bust < hips - 5) {
    return {
      shape: "Pear/Triangle",
      description: "Hips are wider than bust and shoulders",
      confidence: 0.9,
      characteristics: [
        "Fuller hips and thighs",
        "Narrower shoulders and bust",
        "Defined waist"
      ],
      recommendations: [
        "A-line and fit-and-flare dresses",
        "Wide-leg pants and bootcut jeans",
        "Tops with interesting necklines",
        "Structured blazers to balance shoulders"
      ]
    };
  }

  // Apple/Round (bust larger, less defined waist)
  if (bustWaistDiff < 10 && waistHipRatio > 0.85) {
    return {
      shape: "Apple/Round",
      description: "Fuller midsection with less defined waist",
      confidence: 0.85,
      characteristics: [
        "Fuller bust and midsection",
        "Less defined waist",
        "Slimmer hips and legs"
      ],
      recommendations: [
        "Empire waist dresses",
        "V-neck and scoop neck tops",
        "High-waisted bottoms",
        "Flowing fabrics that skim the body"
      ]
    };
  }

  // Hourglass (bust and hips similar, defined waist)
  if (bustHipDiff < 8 && bustWaistDiff > 8 && hipWaistDiff > 8) {
    return {
      shape: "Hourglass",
      description: "Balanced bust and hips with defined waist",
      confidence: 0.95,
      characteristics: [
        "Balanced bust and hip measurements",
        "Well-defined waist",
        "Curves in proportion"
      ],
      recommendations: [
        "Fitted clothing that follows your curves",
        "Wrap dresses and tops",
        "High-waisted styles",
        "Belted garments to emphasize waist"
      ]
    };
  }

  // Inverted Triangle (shoulders/bust larger than hips)
  if (bust > hips + 5 || shoulders > hips + 5) {
    return {
      shape: "Inverted Triangle",
      description: "Broader shoulders and bust than hips",
      confidence: 0.85,
      characteristics: [
        "Broader shoulders or fuller bust",
        "Narrower hips",
        "Athletic build"
      ],
      recommendations: [
        "A-line skirts and dresses",
        "Wide-leg pants",
        "Scoop and V-necklines",
        "Minimize shoulder details"
      ]
    };
  }

  // Rectangle/Straight (similar measurements throughout)
  return {
    shape: "Rectangle/Straight",
    description: "Similar measurements for bust, waist, and hips",
    confidence: 0.8,
    characteristics: [
      "Balanced proportions",
      "Minimal waist definition",
      "Straight silhouette"
    ],
    recommendations: [
      "Create curves with belts and fitted styles",
      "Layering to add dimension",
      "Peplum tops and dresses",
      "Cropped jackets and structured pieces"
    ]
  };
};

// Body shape calculation for men/masculine bodies
const calculateMasculineBodyShape = (chest: number, waist: number, shoulders: number): BodyShapeResult => {
  const shoulderWaistRatio = shoulders / waist;
  const chestWaistRatio = chest / waist;

  // V-Shape/Athletic (broad shoulders, narrow waist)
  if (shoulderWaistRatio > 1.3 && chestWaistRatio > 1.2) {
    return {
      shape: "V-Shape/Athletic",
      description: "Broad shoulders and chest with narrow waist",
      confidence: 0.9,
      characteristics: [
        "Broad shoulders and chest",
        "Narrow waist",
        "Athletic build"
      ],
      recommendations: [
        "Fitted shirts that show your shape",
        "Straight-leg pants",
        "Minimal shoulder padding",
        "V-necks and open collars"
      ]
    };
  }

  // Rectangle (balanced proportions)
  if (shoulderWaistRatio < 1.2) {
    return {
      shape: "Rectangle/Straight",
      description: "Balanced proportions throughout torso",
      confidence: 0.85,
      characteristics: [
        "Shoulders and waist similar width",
        "Straight silhouette",
        "Minimal waist definition"
      ],
      recommendations: [
        "Layering to add dimension",
        "Structured jackets",
        "Horizontal stripes",
        "Fitted cuts to create shape"
      ]
    };
  }

  // Oval/Apple (fuller midsection)
  return {
    shape: "Oval/Apple",
    description: "Fuller midsection with broader waist",
    confidence: 0.8,
    characteristics: [
      "Fuller midsection",
      "Less defined waist",
      "Broader torso"
    ],
    recommendations: [
      "Vertical lines and patterns",
      "Open jackets and cardigans",
      "Darker colors on torso",
      "Avoid tight-fitting clothes around midsection"
    ]
  };
};

export const calculateBodyShape = (measurements: BodyMeasurements): BodyShapeResult => {
  // Normalize measurements to metric
  const height = normalizeUnit(measurements.height, measurements.unit, 'length');
  const weight = normalizeUnit(measurements.weight, measurements.unit, 'weight');
  const bust = normalizeUnit(measurements.bust, measurements.unit, 'length');
  const waist = normalizeUnit(measurements.waist, measurements.unit, 'length');
  const hips = normalizeUnit(measurements.hips, measurements.unit, 'length');
  const shoulders = normalizeUnit(measurements.shoulders, measurements.unit, 'length');

  // Calculate BMI for additional insights
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);

  let result: BodyShapeResult;

  // Use gender-specific calculations
  if (measurements.gender === 'woman') {
    result = calculateFeminineBodyShape(bust, waist, hips, shoulders);
  } else if (measurements.gender === 'man') {
    result = calculateMasculineBodyShape(bust, waist, shoulders);
  } else {
    // Non-binary: provide both analyses and let user choose
    const feminineResult = calculateFeminineBodyShape(bust, waist, hips, shoulders);
    const masculineResult = calculateMasculineBodyShape(bust, waist, shoulders);

    result = {
      shape: `${feminineResult.shape} or ${masculineResult.shape}`,
      description: "Multiple body shape analyses available",
      confidence: Math.max(feminineResult.confidence, masculineResult.confidence),
      characteristics: [...feminineResult.characteristics, ...masculineResult.characteristics],
      recommendations: [...feminineResult.recommendations, ...masculineResult.recommendations]
    };
  }

  // Add age-specific recommendations
  if (measurements.age === '13-17') {
    result.recommendations.push("Focus on comfort and age-appropriate styles");
  } else if (measurements.age === '56+') {
    result.recommendations.push("Choose quality fabrics and classic cuts", "Consider comfort and ease of movement");
  }

  return result;
};

export const getBodyShapeDescriptions = () => {
  return {
    'Pear/Triangle': {
      description: 'Hips wider than bust and shoulders',
      visualCues: 'Bottom-heavy silhouette'
    },
    'Apple/Round': {
      description: 'Fuller midsection with less defined waist',
      visualCues: 'Carry weight in the middle'
    },
    'Hourglass': {
      description: 'Balanced bust and hips with defined waist',
      visualCues: 'Curved silhouette with narrow waist'
    },
    'Inverted Triangle': {
      description: 'Broader shoulders and bust than hips',
      visualCues: 'Top-heavy silhouette'
    },
    'Rectangle/Straight': {
      description: 'Similar measurements throughout',
      visualCues: 'Straight up-and-down silhouette'
    },
    'V-Shape/Athletic': {
      description: 'Broad shoulders with narrow waist',
      visualCues: 'Athletic, muscular build'
    },
    'Oval/Apple': {
      description: 'Fuller midsection',
      visualCues: 'Weight carried in torso area'
    }
  };
};