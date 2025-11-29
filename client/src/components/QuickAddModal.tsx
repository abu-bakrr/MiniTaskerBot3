import { useState, useEffect } from "react";
import { X, ShoppingCart, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/hooks/useConfig";

interface Attribute {
  name: string;
  values: string[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  colors?: string[];
  attributes?: Attribute[];
}

interface QuickAddModalProps {
  isOpen: boolean;
  productId: string | null;
  onClose: () => void;
  onAddToCart: (productId: string, selectedColor?: string, selectedAttributes?: Record<string, string>) => void;
  isInCart?: boolean;
  onCartClick?: () => void;
}

export default function QuickAddModal({
  isOpen,
  productId,
  onClose,
  onAddToCart,
  isInCart = false,
  onCartClick,
}: QuickAddModalProps) {
  const { formatPrice } = useConfig();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | undefined>();
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && productId) {
      fetchProduct();
    } else {
      setProduct(null);
      setSelectedColor(undefined);
      setSelectedAttributes({});
    }
  }, [isOpen, productId]);

  const fetchProduct = async () => {
    if (!productId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
        if (data.colors && data.colors.length > 0) {
          setSelectedColor(data.colors[0]);
        }
        if (data.attributes && data.attributes.length > 0) {
          const defaultAttrs: Record<string, string> = {};
          data.attributes.forEach((attr: Attribute) => {
            if (attr.values.length > 0) {
              defaultAttrs[attr.name] = attr.values[0];
            }
          });
          setSelectedAttributes(defaultAttrs);
        }
      }
    } catch (error) {
      console.error('Error fetching product:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!productId) return;
    
    if (isInCart) {
      onCartClick?.();
    } else {
      onAddToCart(
        productId,
        selectedColor,
        Object.keys(selectedAttributes).length > 0 ? selectedAttributes : undefined
      );
      onClose();
    }
  };

  const handleAttributeSelect = (attrName: string, value: string) => {
    setSelectedAttributes(prev => ({
      ...prev,
      [attrName]: value
    }));
  };

  const hasOptions = (product?.colors && product.colors.length > 0) || 
                     (product?.attributes && product.attributes.length > 0);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-background rounded-t-2xl sm:rounded-2xl max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Добавить в корзину</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : product ? (
            <>
              <div className="flex gap-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  {product.images && product.images[0] ? (
                    <img 
                      src={product.images[0]} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium line-clamp-2">{product.name}</h4>
                  <p className="text-lg font-bold mt-1">{formatPrice(product.price)}</p>
                </div>
              </div>

              {product.colors && product.colors.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Цвет</label>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          selectedColor === color 
                            ? 'border-primary ring-2 ring-primary ring-offset-2' 
                            : 'border-border hover:border-primary/50'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}

              {product.attributes && product.attributes.map((attr) => (
                <div key={attr.name} className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">{attr.name}</label>
                  <div className="flex flex-wrap gap-2">
                    {attr.values.map((value) => (
                      <button
                        key={value}
                        onClick={() => handleAttributeSelect(attr.name, value)}
                        className={`px-3 py-1.5 rounded-md border text-sm transition-all ${
                          selectedAttributes[attr.name] === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border hover:border-primary/50'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {!hasOptions && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Дополнительные опции не требуются
                </p>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Не удалось загрузить товар
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-background border-t p-4">
          <Button
            className="w-full"
            size="lg"
            onClick={handleAddToCart}
            disabled={loading || !product}
          >
            {isInCart ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Перейти в корзину
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                В корзину
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
