import type { CategoryPrediction } from '../types/finance.ts';

export interface TrainingSample {
  text: string;
  category: string;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Rent',
  'Bills',
  'Education',
  'Healthcare',
  'Entertainment',
  'Travel',
  'Other',
] as const;

/**
 * Curated labelled training corpus for the Multinomial Naive Bayes
 * expense categorizer (Indian & international merchants + item terms).
 */
export const BASE_TRAINING_CORPUS: TrainingSample[] = [
  // Food
  { text: 'swiggy biryani dinner order', category: 'Food' },
  { text: 'swiggy instamart lunch delivery', category: 'Food' },
  { text: 'zomato pizza burger meal', category: 'Food' },
  { text: 'dominos pizza garlic bread', category: 'Food' },
  { text: 'starbucks coffee latte cafe', category: 'Food' },
  { text: 'cafe coffee day cappuccino snack', category: 'Food' },
  { text: 'mcdonalds burger fries meal', category: 'Food' },
  { text: 'kfc chicken bucket dinner', category: 'Food' },
  { text: 'subway sandwich salad lunch', category: 'Food' },
  { text: 'chai point masala tea samosa', category: 'Food' },
  { text: 'college canteen mess lunch thali', category: 'Food' },
  { text: 'restaurant dinner family dining', category: 'Food' },
  { text: 'bakery cake pastry bread breakfast', category: 'Food' },
  { text: 'fresh vegetables fruits milk dairy', category: 'Food' },
  { text: 'haldirams snacks sweets dosa idli', category: 'Food' },
  { text: 'blinkit milk eggs bread snacks', category: 'Food' },
  { text: 'zepto curd paneer butter breakfast', category: 'Food' },

  // Transport
  { text: 'uber auto ride commute office', category: 'Transport' },
  { text: 'uber cab airport drop ride', category: 'Transport' },
  { text: 'ola cab prime sedan trip', category: 'Transport' },
  { text: 'rapido bike taxi morning commute', category: 'Transport' },
  { text: 'metro rail smart card recharge', category: 'Transport' },
  { text: 'namma metro delhi metro ticket pass', category: 'Transport' },
  { text: 'bmtc city bus monthly pass', category: 'Transport' },
  { text: 'indian oil petrol pump fuel refill', category: 'Transport' },
  { text: 'hp petrol diesel fuel station', category: 'Transport' },
  { text: 'bharat petroleum two wheeler petrol', category: 'Transport' },
  { text: 'fastag highway toll parking fee', category: 'Transport' },
  { text: 'bike service engine oil puncture repair', category: 'Transport' },
  { text: 'auto rickshaw campus commute', category: 'Transport' },

  // Shopping
  { text: 'amazon online shopping order electronics', category: 'Shopping' },
  { text: 'flipkart headphones usb cable order', category: 'Shopping' },
  { text: 'myntra clothing t-shirt jeans shoes', category: 'Shopping' },
  { text: 'ajio fashion jacket sneakers', category: 'Shopping' },
  { text: 'dmart supermarket household items groceries', category: 'Shopping' },
  { text: 'abc supermarket milk bread rice', category: 'Shopping' },
  { text: 'reliance smart bazaar supermarket store', category: 'Shopping' },
  { text: 'whole foods market supermarket receipt', category: 'Shopping' },
  { text: 'bigbasket monthly groceries rice dal oil', category: 'Shopping' },
  { text: 'zudio apparel shirt trousers shopping', category: 'Shopping' },
  { text: 'decathlon sports backpack bottle shoes', category: 'Shopping' },
  { text: 'croma electronics charger mouse keyboard', category: 'Shopping' },
  { text: 'nykaa skincare shampoo personal care', category: 'Shopping' },
  { text: 'ikea desk lamp storage organizer', category: 'Shopping' },

  // Rent
  { text: 'house rent monthly apartment landlord', category: 'Rent' },
  { text: 'pg hostel accommodation monthly rent', category: 'Rent' },
  { text: 'flat rent deposit society maintenance', category: 'Rent' },
  { text: 'room rent shared apartment monthly', category: 'Rent' },
  { text: 'hostel room fee monthly stay', category: 'Rent' },
  { text: 'nobroker rent transfer landlord', category: 'Rent' },

  // Bills
  { text: 'electricity board bescom power bill', category: 'Bills' },
  { text: 'electricity bill tata power monthly', category: 'Bills' },
  { text: 'airtel fiber broadband wifi internet bill', category: 'Bills' },
  { text: 'jio fiber prepaid mobile recharge plan', category: 'Bills' },
  { text: 'vi postpaid mobile telephone bill', category: 'Bills' },
  { text: 'act fibernet internet monthly bill', category: 'Bills' },
  { text: 'indane lpg gas cylinder utility bill', category: 'Bills' },
  { text: 'water supply municipal utility bill', category: 'Bills' },
  { text: 'dth tata play cable recharge bill', category: 'Bills' },
  { text: 'cloud storage google one icloud bill', category: 'Bills' },

  // Education
  { text: 'college fees semester tuition university', category: 'Education' },
  { text: 'exam registration fee university portal', category: 'Education' },
  { text: 'udemy python machine learning course', category: 'Education' },
  { text: 'coursera data science certification fee', category: 'Education' },
  { text: 'textbooks reference books engineering library', category: 'Education' },
  { text: 'stationery notebooks pens xerox printouts', category: 'Education' },
  { text: 'lab manual project binding print shop', category: 'Education' },
  { text: 'workshop hackathon registration student', category: 'Education' },
  { text: 'coaching classes gate gre tuition', category: 'Education' },

  // Healthcare
  { text: 'apollo pharmacy medicines tablets syrup', category: 'Healthcare' },
  { text: 'medplus pharmacy prescription vitamins', category: 'Healthcare' },
  { text: '1mg pharmeasy medicine online order', category: 'Healthcare' },
  { text: 'doctor consultation clinic checkup fee', category: 'Healthcare' },
  { text: 'dental clinic cleaning checkup', category: 'Healthcare' },
  { text: 'diagnostic lab blood test health check', category: 'Healthcare' },
  { text: 'hospital opd medical bill', category: 'Healthcare' },
  { text: 'cult fit gym fitness membership', category: 'Healthcare' },
  { text: 'lenskart spectacles eye test contact lens', category: 'Healthcare' },

  // Entertainment
  { text: 'bookmyshow movie tickets multiplex cinema', category: 'Entertainment' },
  { text: 'pvr inox movie ticket popcorn', category: 'Entertainment' },
  { text: 'netflix monthly streaming subscription', category: 'Entertainment' },
  { text: 'spotify premium music subscription', category: 'Entertainment' },
  { text: 'amazon prime hotstar disney subscription', category: 'Entertainment' },
  { text: 'youtube premium streaming plan', category: 'Entertainment' },
  { text: 'bowling arcade gaming zone weekend', category: 'Entertainment' },
  { text: 'concert standup comedy event ticket', category: 'Entertainment' },
  { text: 'steam playstation video game purchase', category: 'Entertainment' },

  // Travel
  { text: 'irctc railway train ticket booking', category: 'Travel' },
  { text: 'indigo spicejet flight ticket airfare', category: 'Travel' },
  { text: 'makemytrip hotel booking resort stay', category: 'Travel' },
  { text: 'redbus intercity sleeper bus ticket', category: 'Travel' },
  { text: 'airbnb weekend trip homestay booking', category: 'Travel' },
  { text: 'goibibo flight hotel vacation package', category: 'Travel' },
  { text: 'oyo hotel room booking trip', category: 'Travel' },
  { text: 'outstation trip sightseeing luggage', category: 'Travel' },

  // Other
  { text: 'atm cash withdrawal miscellaneous', category: 'Other' },
  { text: 'bank service charge annual fee', category: 'Other' },
  { text: 'charity donation temple contribution', category: 'Other' },
  { text: 'birthday gift card friend present', category: 'Other' },
  { text: 'courier post office parcel delivery', category: 'Other' },
  { text: 'laundry dry cleaning ironing service', category: 'Other' },
  { text: 'haircut salon grooming barber', category: 'Other' },
];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'paid', 'via', 'upi', 'card', 'cash',
  'payment', 'rs', 'inr', 'to', 'at', 'in', 'on', 'of', 'a', 'an', 'my',
]);

export function tokenizeText(raw: string): string[] {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !STOPWORDS.has(tok) && !/^\d+$/.test(tok));

  const tokens = [...cleaned];
  // Add bigrams for stronger multi-word phrase discrimination (e.g., "college_fees", "electricity_board")
  for (let i = 0; i < cleaned.length - 1; i++) {
    tokens.push(`${cleaned[i]}_${cleaned[i + 1]}`);
  }
  return tokens;
}

/**
 * Multinomial Naive Bayes Classifier with Laplace smoothing (alpha = 1.0)
 * and temperature-scaled softmax probability calibration.
 */
export class ExpenseCategorizer {
  private classDocCounts = new Map<string, number>();
  private classTokenCounts = new Map<string, number>();
  private tokenFreqByClass = new Map<string, Map<string, number>>();
  private vocabulary = new Set<string>();
  private totalDocs = 0;
  private version = 'NB-TF-v1.2';

  constructor(initialSamples: TrainingSample[] = BASE_TRAINING_CORPUS) {
    this.train(initialSamples, 1);
  }

  /**
   * Trains or incrementally updates the Naive Bayes frequency tables.
   * User-verified corrections can be passed with weight > 1 to adapt faster.
   */
  public train(samples: TrainingSample[], weight = 1): void {
    for (const sample of samples) {
      const cat = sample.category.trim();
      if (!cat || !sample.text.trim()) continue;
      const tokens = tokenizeText(sample.text);
      if (tokens.length === 0) continue;

      this.totalDocs += weight;
      this.classDocCounts.set(cat, (this.classDocCounts.get(cat) ?? 0) + weight);

      let freqMap = this.tokenFreqByClass.get(cat);
      if (!freqMap) {
        freqMap = new Map<string, number>();
        this.tokenFreqByClass.set(cat, freqMap);
      }

      let totalClassTokens = this.classTokenCounts.get(cat) ?? 0;
      for (const token of tokens) {
        this.vocabulary.add(token);
        freqMap.set(token, (freqMap.get(token) ?? 0) + weight);
        totalClassTokens += weight;
      }
      this.classTokenCounts.set(cat, totalClassTokens);
    }
  }

  public predict(description: string, merchant = ''): CategoryPrediction {
    const combined = `${merchant} ${description}`.trim();
    const tokens = tokenizeText(combined);

    if (tokens.length === 0) {
      return {
        predictedCategory: 'Other',
        confidence: 0.35,
        calibrated: true,
        topCandidates: [{ category: 'Other', probability: 0.35 }],
        matchedKeywords: [],
        modelVersion: this.version,
      };
    }

    const vocabSize = Math.max(1, this.vocabulary.size);
    const alpha = 1.0;
    const logScores: Array<{ category: string; logProb: number; matched: string[] }> = [];

    for (const [category, docCount] of this.classDocCounts.entries()) {
      const prior = Math.log((docCount + 0.5) / (this.totalDocs + 0.5 * this.classDocCounts.size));
      const freqMap = this.tokenFreqByClass.get(category) ?? new Map<string, number>();
      const totalTokensInCat = this.classTokenCounts.get(category) ?? 0;
      const denom = totalTokensInCat + alpha * vocabSize;

      let logLikelihood = 0;
      const matched: string[] = [];

      for (const tok of tokens) {
        const count = freqMap.get(tok) ?? 0;
        if (count > 0) {
          matched.push(tok.replace('_', ' '));
        }
        // Slight boost for exact vocabulary hits while remaining proper NB likelihood
        const effectiveCount = count > 0 ? count * 1.5 : 0;
        logLikelihood += Math.log((effectiveCount + alpha) / denom);
      }

      logScores.push({
        category,
        logProb: prior + logLikelihood,
        matched: Array.from(new Set(matched)),
      });
    }

    logScores.sort((a, b) => b.logProb - a.logProb);

    // Temperature-calibrated softmax (T = 1.6 prevents overconfident Naive Bayes posteriors)
    const temperature = 1.6;
    const maxLog = logScores[0].logProb;
    const expScores = logScores.map((s) => Math.exp((s.logProb - maxLog) / temperature));
    const sumExp = expScores.reduce((acc, v) => acc + v, 0);

    const candidates = logScores.map((s, idx) => ({
      category: s.category,
      probability: Number((expScores[idx] / sumExp).toFixed(3)),
      matched: s.matched,
    }));

    const best = candidates[0];
    // If zero tokens matched any training class, fall back conservatively to Other
    if (best.matched.length === 0) {
      return {
        predictedCategory: 'Other',
        confidence: 0.42,
        calibrated: true,
        topCandidates: [
          { category: 'Other', probability: 0.42 },
          ...candidates.slice(0, 2).map((c) => ({ category: c.category, probability: Math.min(c.probability, 0.25) })),
        ],
        matchedKeywords: [],
        modelVersion: this.version,
      };
    }

    return {
      predictedCategory: best.category,
      confidence: Math.min(0.96, Math.max(0.25, best.probability)),
      calibrated: true,
      topCandidates: candidates.slice(0, 3).map((c) => ({
        category: c.category,
        probability: c.probability,
      })),
      matchedKeywords: best.matched.slice(0, 5),
      modelVersion: this.version,
    };
  }
}

export function createCategorizer(userCorrections: TrainingSample[] = []): ExpenseCategorizer {
  const model = new ExpenseCategorizer(BASE_TRAINING_CORPUS);
  if (userCorrections.length > 0) {
    model.train(userCorrections, 3);
  }
  return model;
}
