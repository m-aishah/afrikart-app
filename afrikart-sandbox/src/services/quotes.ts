import type { Quote, Store } from "../types";

interface QuoteValidationOptions {
  sourceCurrency?: string;
  destinationCurrency?: string;
  amount?: number;
  expiredError?: string;
}

interface QuoteValidationResult {
  quote?: Quote;
  error?: {
    error: string;
    errorType?: string;
  };
}

export function validateQuote(
  store: Store,
  quoteReference: string,
  options: QuoteValidationOptions = {},
): QuoteValidationResult {
  const quote = store.quotes.get(quoteReference);
  if (!quote) {
    return {
      error: {
        error: "Invalid quoteReference",
      },
    };
  }

  if (new Date(quote.expireAt) < new Date()) {
    return {
      error: {
        error: options.expiredError ?? "Quote has expired",
        errorType: "QUOTE_EXPIRED",
      },
    };
  }

  if (
    options.sourceCurrency &&
    options.destinationCurrency &&
    (quote.sourceCurrency !== options.sourceCurrency ||
      quote.destinationCurrency !== options.destinationCurrency)
  ) {
    return {
      error: {
        error: "Quote currencies do not match payout currencies",
        errorType: "QUOTE_MISMATCH",
      },
    };
  }

  if (
    typeof options.amount === "number" &&
    Number.isFinite(options.amount) &&
    quote.sourceAmount !== options.amount
  ) {
    return {
      error: {
        error: `Quote was for ${quote.sourceAmount} ${options.sourceCurrency}, but payout is for ${options.amount}`,
        errorType: "QUOTE_AMOUNT_MISMATCH",
      },
    };
  }

  return { quote };
}
