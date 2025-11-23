import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/hooks/useCart";
import { useFavorites } from "@/hooks/useFavorites";
import Home from "@/pages/Home";
import Cart from "@/pages/Cart";
import Favorites from "@/pages/Favorites";
import Product from "@/pages/Product";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ThemeApplier from "@/components/ThemeApplier";
import FontLoader from "@/components/FontLoader";

type Page = 'home' | 'cart' | 'favorites' | 'product' | 'login' | 'register';

interface PendingAction {
  type: 'addToCart' | 'toggleFavorite' | 'navigate';
  productId?: string;
  selectedColor?: string;
  selectedAttributes?: Record<string, string>;
  targetPage?: Page;
}

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  
  const { user, isLoading: isUserLoading } = useAuth();

  const { 
    cartItems, 
    isLoading: isCartLoading, 
    addToCart, 
    updateQuantity, 
    removeFromCart, 
    clearCart 
  } = useCart();
  
  const { 
    favoriteItems, 
    isLoading: isFavoritesLoading, 
    toggleFavorite, 
    favoriteIds 
  } = useFavorites();

  useEffect(() => {
    if (user && pendingAction && !isUserLoading) {
      const action = pendingAction;
      setPendingAction(null);
      
      if (action.type === 'addToCart' && action.productId) {
        addToCart(action.productId, action.selectedColor, action.selectedAttributes);
      } else if (action.type === 'toggleFavorite' && action.productId) {
        toggleFavorite(action.productId);
      }
      
      setCurrentPage(action.targetPage || 'home');
    }
  }, [user, isUserLoading]);

  const handleAddToCart = (id: string, selectedColor?: string, selectedAttributes?: Record<string, string>) => {
    if (!user) {
      setPendingAction({ 
        type: 'addToCart', 
        productId: id, 
        selectedColor, 
        selectedAttributes,
        targetPage: currentPage
      });
      setCurrentPage('register');
      return;
    }
    addToCart(id, selectedColor, selectedAttributes);
  };

  const handleToggleFavorite = (id: string) => {
    if (!user) {
      setPendingAction({ 
        type: 'toggleFavorite', 
        productId: id,
        targetPage: currentPage
      });
      setCurrentPage('register');
      return;
    }
    toggleFavorite(id);
  };

  const handleProductClick = (id: string) => {
    setSelectedProductId(id);
    setCurrentPage('product');
  };

  const handleQuantityChange = (id: string, quantity: number) => {
    const cartItem = cartItems.find(item => item.cart_id === id || item.id === id);
    updateQuantity({ cartId: cartItem?.cart_id, productId: id, quantity });
  };

  const handleRemoveItem = (id: string) => {
    const cartItem = cartItems.find(item => item.cart_id === id || item.id === id);
    if (cartItem?.cart_id) {
      removeFromCart(cartItem.cart_id);
    }
  };

  const handleClearCart = () => {
    clearCart();
  };

  const transformedCartItems = cartItems.map(item => ({
    id: item.cart_id || item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    images: item.images,
    selected_color: item.selected_color,
    selected_attributes: item.selected_attributes,
  }));

  const transformedFavoriteItems = favoriteItems.map(item => ({
    id: item.id,
    name: item.name,
    price: item.price,
    images: item.images,
    isFavorite: true,
  }));

  const cartCount = transformedCartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartItemIds = cartItems.map(item => item.product_id || item.id);

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (currentPage === 'login') {
    return (
      <Login
        onRegisterClick={() => setCurrentPage('register')}
        onSuccess={() => {
          if (!pendingAction) {
            setCurrentPage('home');
          }
        }}
      />
    );
  }

  if (currentPage === 'register') {
    return (
      <Register
        onLoginClick={() => setCurrentPage('login')}
        onSuccess={() => {
          if (!pendingAction) {
            setCurrentPage('home');
          }
        }}
      />
    );
  }

  const handleCartClick = () => {
    if (!user) {
      setPendingAction({ 
        type: 'navigate', 
        targetPage: 'cart'
      });
      setCurrentPage('register');
      return;
    }
    setCurrentPage('cart');
  };

  const handleFavoritesClick = () => {
    if (!user) {
      setPendingAction({ 
        type: 'navigate', 
        targetPage: 'favorites'
      });
      setCurrentPage('register');
      return;
    }
    setCurrentPage('favorites');
  };

  return (
    <div className="w-full mx-auto bg-background min-h-screen">
      <div className="w-full">
        {currentPage === 'home' && (
          <Home
            onCartClick={handleCartClick}
            onFavoritesClick={handleFavoritesClick}
            onProductClick={handleProductClick}
            cartCount={cartCount}
            favoritesCount={transformedFavoriteItems.length}
            onAddToCart={handleAddToCart}
            onToggleFavorite={handleToggleFavorite}
            favoriteIds={favoriteIds}
            cartItemIds={cartItemIds}
          />
        )}
        
        {currentPage === 'cart' && (
          <Cart
            items={transformedCartItems}
            onBack={() => setCurrentPage('home')}
            onQuantityChange={handleQuantityChange}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
          />
        )}
        
        {currentPage === 'favorites' && (
          <Favorites
            items={transformedFavoriteItems}
            onBack={() => setCurrentPage('home')}
            onClearAll={() => {
              favoriteIds.forEach(id => toggleFavorite(id));
            }}
            onToggleFavorite={handleToggleFavorite}
            onAddToCart={handleAddToCart}
            onProductClick={handleProductClick}
          />
        )}
        
        {currentPage === 'product' && (
          <Product
            productId={selectedProductId}
            onBack={() => setCurrentPage('home')}
            onAddToCart={handleAddToCart}
            onToggleFavorite={handleToggleFavorite}
            isFavorite={favoriteIds.includes(selectedProductId)}
            isInCart={cartItemIds.includes(selectedProductId)}
            onCartClick={() => setCurrentPage('cart')}
          />
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ThemeApplier />
          <FontLoader />
          <AppContent />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
