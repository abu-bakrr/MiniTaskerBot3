import { Heart, ShoppingCart, Check, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";
import { useConfig } from "@/hooks/useConfig";

interface AvailabilityData {
  status: 'in_stock' | 'backorder' | 'not_tracked';
  in_stock: boolean;
  total_quantity: number;
  backorder_lead_time_days: number | null;
}

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  images: string[];
  isFavorite?: boolean;
  isInCart?: boolean;
  availability?: AvailabilityData;
  onToggleFavorite?: (id: string) => void;
  onAddToCart?: (id: string) => void;
  onClick?: (id: string) => void;
  onCartClick?: () => void;
}

export default function ProductCard({
  id,
  name,
  price,
  images,
  isFavorite = false,
  isInCart = false,
  availability,
  onToggleFavorite,
  onAddToCart,
  onClick,
  onCartClick,
}: ProductCardProps) {
  const { formatPrice } = useConfig();
  const [currentImage, setCurrentImage] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isSwiping = useRef(false);
  const touchStartY = useRef(0);

  const handleFavoriteClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(id);
  };

  const handleCartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInCart) {
      onCartClick?.();
    } else {
      onAddToCart?.(id);
    }
  };

  const handleCardClick = () => {
    if (!isSwiping.current) {
      onClick?.(id);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    
    const swipeDistance = Math.abs(touchStartX.current - touchEndX.current);
    const verticalDistance = Math.abs(touchStartY.current - e.touches[0].clientY);
    
    if (swipeDistance > 10 && swipeDistance > verticalDistance) {
      isSwiping.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (isSwiping.current && Math.abs(swipeDistance) > minSwipeDistance) {
      e.stopPropagation();
      e.preventDefault();
      
      if (swipeDistance > 0) {
        setCurrentImage((prev) => (prev + 1) % images.length);
      } else {
        setCurrentImage((prev) => (prev - 1 + images.length) % images.length);
      }
    }

    setTimeout(() => {
      isSwiping.current = false;
    }, 100);

    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const handleFavoriteTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleFavoriteTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    handleFavoriteClick(e);
  };

  return (
    <div
      onClick={handleCardClick}
      className="bg-transparent cursor-pointer active:opacity-80 transition-opacity duration-150"
      data-testid={`card-product-${id}`}
    >
      <div
        className="relative aspect-square bg-muted/50 rounded-2xl overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseLeave={() => setCurrentImage(0)}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          {images.map((img, idx) => (
            imageErrors.has(idx) ? (
              <div
                key={idx}
                className={`absolute inset-0 w-full h-full flex items-center justify-center transition-opacity duration-300 ${
                  idx === currentImage ? "opacity-100" : "opacity-0"
                }`}
              >
                <ImageIcon className="w-16 h-16 text-muted-foreground/40" />
              </div>
            ) : (
              <img
                key={idx}
                src={img}
                alt={name}
                className={`absolute inset-0 w-full h-full object-cover rounded-2xl transition-opacity duration-300 ${
                  idx === currentImage ? "opacity-100" : "opacity-0"
                }`}
                loading="lazy"
                onError={() => {
                  setImageErrors(prev => new Set(prev).add(idx));
                }}
              />
            )
          ))}
        </div>
        
        {/* Hover-зоны для ПК - невидимые области для переключения фото */}
        {images.length > 1 && (
          <div className="absolute inset-0 hidden md:flex z-[5]">
            {images.map((_, idx) => (
              <div
                key={idx}
                className="flex-1 h-full cursor-pointer"
                onMouseEnter={() => setCurrentImage(idx)}
              />
            ))}
          </div>
        )}
        <button
          onClick={handleFavoriteClick}
          onTouchStart={handleFavoriteTouchStart}
          onTouchEnd={handleFavoriteTouchEnd}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center z-10 active:scale-90 transition-transform"
          data-testid={`button-favorite-${id}`}
        >
          <Heart
            className={`w-4 h-4 transition-colors ${isFavorite ? "fill-red-500 text-red-500" : "text-foreground/60"}`}
          />
        </button>
        
        {images.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentImage ? "w-4 bg-foreground" : "w-1.5 bg-foreground/30"
                }`}
              />
            ))}
          </div>
        )}
      </div>
      
      <div className="pt-2.5 pb-1 px-1 space-y-1">
        <h3 
          className="text-[13px] text-foreground line-clamp-2 leading-tight" 
          style={{ 
            fontFamily: 'var(--font-family-custom, Inter)',
            fontWeight: 'var(--font-weight-product-name, 400)'
          }}
          data-testid={`text-product-name-${id}`}
        >
          {name}
        </h3>
        
        <div className="flex items-center justify-between">
          <p 
            className="text-[14px] text-foreground" 
            style={{ 
              fontFamily: 'var(--font-family-custom, Inter)',
              fontWeight: 'var(--font-weight-price, 600)'
            }}
            data-testid={`text-product-price-${id}`}
          >
            {formatPrice(price)}
          </p>
          <Button
            size="icon"
            variant={isInCart ? "default" : "ghost"}
            onClick={handleCartClick}
            className="h-7 w-7 rounded-full shrink-0"
            data-testid={`button-add-to-cart-${id}`}
          >
            {isInCart ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <ShoppingCart className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
