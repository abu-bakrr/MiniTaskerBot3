import { useQuery } from "@tanstack/react-query";

export interface AppConfig {
  shopName: string;
  description: string;
  logo: string;
  seo?: {
    title?: string;
    description?: string;
    keywords?: string;
    siteUrl?: string;
    language?: string;
  };
  currency: {
    symbol: string;
    code: string;
    position: "before" | "after";
  };
  managerContact: string;
  categories: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
  colorScheme: {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    border: string;
    input: string;
    ring: string;
  };
  sortOptions: Array<{
    id: string;
    label: string;
    emoji?: string;
  }>;
  ui: {
    maxWidth: string;
    productsPerPage: number;
    showCategoryIcons: boolean;
    showPriceFilter: boolean;
  };
  texts: {
    addToCart: string;
    addedToCart: string;
    checkout: string;
    total: string;
    emptyCart: string;
    emptyFavorites: string;
    loading: string;
  };
  fonts?: {
    fontFamily: string;
    fontFile: string | null;
    productName: {
      weight: number;
    };
    price: {
      weight: number;
    };
    description: {
      weight: number;
    };
  };
  logoSize?: number;
  orderStatuses?: {
    [key: string]: string;
  };
}

export function useConfig() {
  const { data: config, isLoading, error } = useQuery<AppConfig>({
    queryKey: ["/api/config"],
    staleTime: Infinity,
  });

  const formatPrice = (price: number) => {
    if (!config) return `${price}`;
    
    const formatted = price.toLocaleString();
    return config.currency.position === "before"
      ? `${config.currency.symbol}${formatted}`
      : `${formatted} ${config.currency.symbol}`;
  };

  return {
    config,
    isLoading,
    error,
    formatPrice,
  };
}
