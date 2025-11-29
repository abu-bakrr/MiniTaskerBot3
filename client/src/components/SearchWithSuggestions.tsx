import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useConfig } from "@/hooks/useConfig";

interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
}

interface SearchWithSuggestionsProps {
  products: Product[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onProductClick: (id: string) => void;
  isLoading?: boolean;
}

export default function SearchWithSuggestions({
  products,
  searchQuery,
  onSearchChange,
  onProductClick,
  isLoading = false,
}: SearchWithSuggestionsProps) {
  const { formatPrice } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    
    const query = searchQuery.toLowerCase();
    return products
      .filter(product => product.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [products, searchQuery]);

  const shouldShowDropdown = isOpen && searchQuery.length >= 2;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (!shouldShowDropdown || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelectProduct(suggestions[highlightedIndex].id);
        }
        break;
    }
  };

  const handleSelectProduct = (productId: string) => {
    setIsOpen(false);
    onProductClick(productId);
  };

  const handleClear = () => {
    onSearchChange("");
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Поиск товаров..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className="w-full h-10 pl-10 pr-10 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          data-testid="input-search"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {shouldShowDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
          {isLoading ? (
            <div className="p-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            </div>
          ) : suggestions.length > 0 ? (
            <div className="p-2">
              <p className="text-xs text-muted-foreground px-2 pb-2">
                Найдено: {suggestions.length} {suggestions.length === 1 ? 'товар' : suggestions.length < 5 ? 'товара' : 'товаров'}
              </p>
              <div className="space-y-1">
                {suggestions.map((product, index) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelectProduct(product.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                      highlightedIndex === index 
                        ? 'bg-primary/10' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Search className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-sm text-primary font-semibold">
                        {formatPrice(product.price)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Ничего не найдено по запросу "{searchQuery}"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
