import { Heart, ShoppingCart, ArrowLeft, Check, Image as ImageIcon, Package, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";
import { useConfig } from "@/hooks/useConfig";

interface Attribute {
  name: string;
  values: string[];
}

interface InventoryItem {
  color: string | null;
  attribute1_value: string | null;
  attribute2_value: string | null;
  quantity: number;
  backorder_lead_time_days: number | null;
}

interface ProductDetailProps {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  colors?: string[];
  attributes?: Attribute[];
  inventory?: InventoryItem[];
  isFavorite?: boolean;
  isInCart?: boolean;
  onToggleFavorite?: (id: string) => void;
  onAddToCart?: (id: string, selectedColor?: string, selectedAttributes?: Record<string, string>) => void;
  onBack?: () => void;
  onCartClick?: () => void;
}

export default function ProductDetail({
  id,
  name,
  description,
  price,
  images,
  colors,
  attributes,
  inventory = [],
  isFavorite = false,
  isInCart: isInCartProp = false,
  onToggleFavorite,
  onAddToCart,
  onBack,
  onCartClick,
}: ProductDetailProps) {
  const { formatPrice } = useConfig();
  
  const [currentImage, setCurrentImage] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [selectedColor, setSelectedColor] = useState<string | undefined>();
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [wasAddedToCart, setWasAddedToCart] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  // Local state controls button - shows "Go to cart" after adding until characteristics change
  const isInCart = wasAddedToCart;

  // Get inventory info for current combination
  const getCurrentInventory = (): InventoryItem | undefined => {
    if (inventory.length === 0) return undefined;
    
    const attrValues = Object.values(selectedAttributes);
    const attr1 = attrValues[0] || null;
    const attr2 = attrValues[1] || null;
    
    return inventory.find(inv => 
      (inv.color === selectedColor || (inv.color === null && !selectedColor)) &&
      (inv.attribute1_value === attr1 || (inv.attribute1_value === null && !attr1)) &&
      (inv.attribute2_value === attr2 || (inv.attribute2_value === null && !attr2))
    );
  };

  const currentInventory = getCurrentInventory();
  const hasInventoryTracking = inventory.length > 0;

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleFavorite = () => {
    onToggleFavorite?.(id);
  };

  const handleCartAction = () => {
    if (isInCart) {
      onCartClick?.();
    } else {
      onAddToCart?.(id, selectedColor, Object.keys(selectedAttributes).length > 0 ? selectedAttributes : undefined);
      setWasAddedToCart(true);
    }
  };

  const handleAttributeSelect = (attrName: string, value: string) => {
    setSelectedAttributes(prev => ({
      ...prev,
      [attrName]: value
    }));
    setWasAddedToCart(false);
  };
  
  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setWasAddedToCart(false);
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

  const handleTouchEnd = () => {
    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (isSwiping.current && Math.abs(swipeDistance) > minSwipeDistance) {
      if (swipeDistance > 0) {
        nextImage();
      } else {
        prevImage();
      }
    }

    isSwiping.current = false;
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  return (
    <div className="min-h-screen bg-background pb-6" data-testid="product-detail">
      <div className="max-w-[420px] mx-auto">
        {/* Back Button Header */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b px-4 py-3 flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={onBack}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-semibold">Детали товара</h2>
        </div>

        {/* Image Gallery */}
        <div className="p-4">
          <div
            className="relative aspect-square bg-muted rounded-xl overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="relative w-full h-full">
              {images.map((img, idx) => (
                imageErrors.has(idx) ? (
                  <div
                    key={idx}
                    className={`absolute inset-0 w-full h-full flex items-center justify-center transition-opacity duration-300 ${
                      idx === currentImage ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <ImageIcon className="w-20 h-20 text-muted-foreground/40" />
                  </div>
                ) : (
                  <img
                    key={idx}
                    src={img}
                    alt={name}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                      idx === currentImage ? "opacity-100" : "opacity-0"
                    }`}
                    onError={() => {
                      setImageErrors(prev => new Set(prev).add(idx));
                    }}
                  />
                )
              ))}
            </div>
            
            {/* Hover-зоны для ПК - невидимые области для переключения фото */}
            {images.length > 1 && (
              <div className="absolute inset-0 hidden md:flex z-[1]">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className="flex-1 h-full cursor-pointer"
                    onMouseEnter={() => setCurrentImage(idx)}
                  />
                ))}
              </div>
            )}
            
            {/* Favorite Button */}
            <button
              onClick={handleFavorite}
              className="absolute top-3 left-3 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center z-10"
              data-testid="button-toggle-favorite"
            >
              <Heart
                className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : "text-foreground"}`}
              />
            </button>

            {/* Image Indicators */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentImage 
                        ? "w-4 bg-foreground" 
                        : "w-1.5 bg-foreground/30"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className="px-4 space-y-4">
          <div>
            <h1 
              className="text-2xl mb-2" 
              style={{ 
                fontFamily: 'var(--font-family-custom, Inter)',
                fontWeight: 'var(--font-weight-product-name, 500)'
              }}
              data-testid="text-product-detail-name"
            >
              {name}
            </h1>
            <p 
              className="text-3xl text-foreground" 
              style={{ 
                fontFamily: 'var(--font-family-custom, Inter)',
                fontWeight: 'var(--font-weight-price, 600)'
              }}
              data-testid="text-product-detail-price"
            >
              {formatPrice(price)}
            </p>
            {(() => {
              const hasColors = colors && colors.length > 0;
              const hasAttributes = attributes && attributes.length > 0;
              const colorSelected = !hasColors || selectedColor;
              const allAttributesSelected = !hasAttributes || 
                attributes.every(attr => selectedAttributes[attr.name]);
              const combinationSelected = colorSelected && allAttributesSelected;
              
              if (!combinationSelected) return null;
              
              if (currentInventory && currentInventory.quantity > 0) {
                return (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      <Package className="w-3 h-3" />
                      <span>В наличии</span>
                    </span>
                  </div>
                );
              } else {
                return (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" />
                      <span>Под заказ</span>
                    </span>
                  </div>
                );
              }
            })()}
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-2">Описание</h3>
            <p 
              className="text-sm text-muted-foreground leading-relaxed" 
              style={{ 
                fontFamily: 'var(--font-family-custom, Inter)',
                fontWeight: 'var(--font-weight-description, 400)'
              }}
              data-testid="text-product-description"
            >
              {description}
            </p>
          </div>

          {/* Attributes Selection */}
          {attributes && attributes.length > 0 && (
            <div className="space-y-4">
              {attributes.map((attr, idx) => (
                <div key={idx} className="space-y-2">
                  <h3 className="text-sm font-semibold">{attr.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    {attr.values.map((value, vIdx) => (
                      <button
                        key={vIdx}
                        onClick={() => handleAttributeSelect(attr.name, value)}
                        className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          selectedAttributes[attr.name] === value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:border-primary/50'
                        }`}
                        data-testid={`button-attribute-${attr.name}-${value}`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Color Selection */}
          {colors && colors.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Цвет</h3>
              <div className="flex flex-wrap gap-3">
                {colors.map((color, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleColorSelect(color)}
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
                      selectedColor === color
                        ? 'border-foreground scale-110'
                        : 'border-border hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    data-testid={`button-color-${idx}`}
                  >
                    {selectedColor === color && (
                      <Check className="w-5 h-5 mx-auto text-white drop-shadow-lg" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          {(() => {
            const hasColors = colors && colors.length > 0;
            const hasAttributes = attributes && attributes.length > 0;
            const colorSelected = !hasColors || selectedColor;
            const allAttributesSelected = !hasAttributes || 
              attributes.every(attr => selectedAttributes[attr.name]);
            const canAddToCart = colorSelected && allAttributesSelected;
            
            const getMissingSelections = () => {
              const missing = [];
              if (hasColors && !selectedColor) missing.push('цвет');
              if (hasAttributes) {
                attributes.forEach(attr => {
                  if (!selectedAttributes[attr.name]) missing.push(attr.name.toLowerCase());
                });
              }
              return missing;
            };
            
            return (
              <div className="space-y-2">
                <Button
                  onClick={handleCartAction}
                  className="w-full gap-2 h-12"
                  size="lg"
                  variant={isInCart ? "default" : "default"}
                  disabled={!isInCart && !canAddToCart}
                  data-testid="button-add-to-cart-detail"
                >
                  {isInCart ? (
                    <>
                      <Check className="w-5 h-5" />
                      Перейти в корзину
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-5 h-5" />
                      Добавить в корзину
                    </>
                  )}
                </Button>
                {!isInCart && !canAddToCart && (
                  <p className="text-xs text-center text-muted-foreground">
                    Выберите: {getMissingSelections().join(', ')}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
