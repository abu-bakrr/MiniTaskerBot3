import { useEffect } from 'react';
import { useConfig } from '@/hooks/useConfig';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'product' | 'article';
  product?: {
    name: string;
    description?: string;
    price: number;
    currency?: string;
    images?: string[];
    availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
    category?: string;
  };
}

export default function SEO({ 
  title, 
  description, 
  image, 
  url,
  type = 'website',
  product 
}: SEOProps) {
  const { config } = useConfig();
  
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  
  const pageTitle = title 
    ? `${title} | ${config?.shopName || 'Shop'}` 
    : config?.description || config?.shopName || 'Shop';
  
  const pageDescription = description || config?.description || '';
  const pageImage = image || config?.logo || '/config/logo.svg';
  const fullImageUrl = pageImage.startsWith('http') ? pageImage : `${siteUrl}${pageImage}`;
  
  useEffect(() => {
    document.title = pageTitle;
    
    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let element = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };
    
    setMeta('description', pageDescription);
    setMeta('og:title', pageTitle, true);
    setMeta('og:description', pageDescription, true);
    setMeta('og:image', fullImageUrl, true);
    setMeta('og:url', currentUrl, true);
    setMeta('og:type', type === 'product' ? 'product' : 'website', true);
    setMeta('og:site_name', config?.shopName || 'Shop', true);
    
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', pageTitle);
    setMeta('twitter:description', pageDescription);
    setMeta('twitter:image', fullImageUrl);
    
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', currentUrl);
    
    if (product) {
      const currency = config?.currency?.code || 'UZS';
      const productSchema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description || '',
        image: product.images?.map(img => img.startsWith('http') ? img : `${siteUrl}${img}`) || [],
        offers: {
          '@type': 'Offer',
          price: product.price,
          priceCurrency: currency,
          availability: `https://schema.org/${product.availability || 'InStock'}`,
          url: currentUrl
        }
      };
      
      let scriptElement = document.querySelector('script[data-schema="product"]') as HTMLScriptElement;
      if (!scriptElement) {
        scriptElement = document.createElement('script');
        scriptElement.setAttribute('type', 'application/ld+json');
        scriptElement.setAttribute('data-schema', 'product');
        document.head.appendChild(scriptElement);
      }
      scriptElement.textContent = JSON.stringify(productSchema);
    }
    
    return () => {
      const productSchema = document.querySelector('script[data-schema="product"]');
      if (productSchema) {
        productSchema.remove();
      }
    };
  }, [pageTitle, pageDescription, fullImageUrl, currentUrl, type, product, config]);
  
  return null;
}

export function OrganizationSchema() {
  const { config } = useConfig();
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  
  useEffect(() => {
    if (!config) return;
    
    const logoUrl = config.logo?.startsWith('http') ? config.logo : `${siteUrl}${config.logo}`;
    
    const orgSchema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: config.shopName,
      description: config.description,
      url: siteUrl,
      logo: logoUrl,
      image: logoUrl
    };
    
    let scriptElement = document.querySelector('script[data-schema="organization"]') as HTMLScriptElement;
    if (!scriptElement) {
      scriptElement = document.createElement('script');
      scriptElement.setAttribute('type', 'application/ld+json');
      scriptElement.setAttribute('data-schema', 'organization');
      document.head.appendChild(scriptElement);
    }
    scriptElement.textContent = JSON.stringify(orgSchema);
    
    return () => {
      const schema = document.querySelector('script[data-schema="organization"]');
      if (schema) schema.remove();
    };
  }, [config, siteUrl]);
  
  return null;
}

export function ShopSchema() {
  const { config } = useConfig();
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  
  useEffect(() => {
    if (!config) return;
    
    const shopSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: config.shopName,
      url: siteUrl,
      description: config.description,
      image: config.logo?.startsWith('http') ? config.logo : `${siteUrl}${config.logo}`
    };
    
    let scriptElement = document.querySelector('script[data-schema="website"]') as HTMLScriptElement;
    if (!scriptElement) {
      scriptElement = document.createElement('script');
      scriptElement.setAttribute('type', 'application/ld+json');
      scriptElement.setAttribute('data-schema', 'website');
      document.head.appendChild(scriptElement);
    }
    scriptElement.textContent = JSON.stringify(shopSchema);
    
    return () => {
      const schema = document.querySelector('script[data-schema="website"]');
      if (schema) schema.remove();
    };
  }, [config, siteUrl]);
  
  return null;
}

export function BreadcrumbSchema({ items }: { items: { name: string; url: string }[] }) {
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  
  useEffect(() => {
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url.startsWith('http') ? item.url : `${siteUrl}${item.url}`
      }))
    };
    
    let scriptElement = document.querySelector('script[data-schema="breadcrumb"]') as HTMLScriptElement;
    if (!scriptElement) {
      scriptElement = document.createElement('script');
      scriptElement.setAttribute('type', 'application/ld+json');
      scriptElement.setAttribute('data-schema', 'breadcrumb');
      document.head.appendChild(scriptElement);
    }
    scriptElement.textContent = JSON.stringify(breadcrumbSchema);
    
    return () => {
      const schema = document.querySelector('script[data-schema="breadcrumb"]');
      if (schema) schema.remove();
    };
  }, [items, siteUrl]);
  
  return null;
}
