import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductGrid from "@/components/ProductGrid";

interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  isFavorite?: boolean;
}

interface FavoritesProps {
  items: Product[];
  onBack: () => void;
  onClearAll: () => void;
  onToggleFavorite: (id: string) => void;
  onAddToCart: (id: string, selectedColor?: string, selectedAttributes?: Record<string, string>) => void;
  onProductClick: (id: string) => void;
}

export default function Favorites({
  items,
  onBack,
  onClearAll,
  onToggleFavorite,
  onAddToCart,
  onProductClick,
}: FavoritesProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b border-border px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={onBack}
              data-testid="button-back-favorites"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold">Избранное</h1>
          </div>
          
          {items.length > 0 && (
            <Button
              variant="ghost"
              onClick={onClearAll}
              className="text-destructive"
              data-testid="button-clear-favorites"
            >
              Очистить всё
            </Button>
          )}
        </div>
      </div>

      <div className="w-full">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">❤️</div>
            <p className="text-muted-foreground">Нет избранных товаров</p>
          </div>
        ) : (
          <ProductGrid
            products={items}
            onToggleFavorite={onToggleFavorite}
            onAddToCart={onAddToCart}
            onProductClick={onProductClick}
          />
        )}
      </div>
    </div>
  );
}
