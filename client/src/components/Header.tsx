import { Heart, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/hooks/useConfig";
import ProfileDropdown from "./ProfileDropdown";

interface HeaderProps {
  onFavoritesClick?: () => void;
  onCartClick?: () => void;
  favoritesCount?: number;
  cartCount?: number;
  showProfile?: boolean;
}

export default function Header({ 
  onFavoritesClick, 
  onCartClick,
  favoritesCount = 0,
  cartCount = 0,
  showProfile = true
}: HeaderProps) {
  const { config } = useConfig();
  const logoSize = config?.logoSize || 32;

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border px-4 md:px-6 py-3 md:py-4" data-testid="header-main">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          {config?.logo && (
            <img 
              src={config.logo} 
              alt="Logo" 
              style={{ width: `${logoSize}px`, height: 'auto' }}
              className="object-contain"
            />
          )}
          <h1 className="text-lg font-semibold text-foreground" data-testid="text-brand-name">
            {config?.shopName || "Loading..."}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={onFavoritesClick}
            className="relative"
            data-testid="button-favorites"
          >
            <Heart className="w-5 h-5" />
            {favoritesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center" data-testid="text-favorites-count">
                {favoritesCount}
              </span>
            )}
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            onClick={onCartClick}
            className="relative"
            data-testid="button-cart"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center" data-testid="text-cart-count">
                {cartCount}
              </span>
            )}
          </Button>

          {showProfile && <ProfileDropdown />}
        </div>
      </div>
    </header>
  );
}
