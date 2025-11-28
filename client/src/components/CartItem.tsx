import { Minus, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useConfig } from "@/hooks/useConfig";

interface CartItemProps {
  id: string;
  name: string;
  price: number;
  quantity: number;
  images: string[];
  selected_color?: string;
  selected_attributes?: Record<string, string>;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export default function CartItem({
  id,
  name,
  price,
  quantity,
  images,
  selected_color,
  selected_attributes,
  onQuantityChange,
  onRemove,
}: CartItemProps) {
  const { formatPrice } = useConfig();
  const [imageError, setImageError] = useState(false);

  return (
    <div className="flex gap-3 p-3 bg-card rounded-md border border-card-border" data-testid={`cart-item-${id}`}>
      <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center overflow-hidden">
        {imageError ? (
          <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
        ) : (
          <img
            src={images[0]}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium mb-1 line-clamp-2" data-testid={`text-cart-item-name-${id}`}>
          {name}
        </h3>
        
        {(selected_color || (selected_attributes && Object.keys(selected_attributes).length > 0)) && (
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {selected_color && (
              <div className="flex items-center gap-1">
                <div 
                  className="w-4 h-4 rounded-full border border-border" 
                  style={{ backgroundColor: selected_color }}
                  title={selected_color}
                />
              </div>
            )}
            {selected_attributes && Object.entries(selected_attributes).map(([key, value]) => (
              <span key={key} className="text-xs bg-muted px-2 py-0.5 rounded">
                {key}: {value}
              </span>
            ))}
          </div>
        )}
        
        <p className="text-sm font-semibold mb-2" data-testid={`text-cart-item-price-${id}`}>
          {formatPrice(price)}
        </p>
        
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => onQuantityChange(id, quantity - 1)}
            disabled={quantity <= 1}
            className="h-7 w-7"
            data-testid={`button-decrease-${id}`}
          >
            <Minus className="w-3 h-3" />
          </Button>
          
          <span className="text-sm font-medium min-w-6 text-center" data-testid={`text-quantity-${id}`}>
            {quantity}
          </span>
          
          <Button
            size="icon"
            variant="outline"
            onClick={() => onQuantityChange(id, quantity + 1)}
            className="h-7 w-7"
            data-testid={`button-increase-${id}`}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={() => onRemove(id)}
        className="h-8 w-8 text-destructive"
        data-testid={`button-remove-${id}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
