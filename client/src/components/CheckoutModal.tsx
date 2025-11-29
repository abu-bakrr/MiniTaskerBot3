import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfig } from "@/hooks/useConfig";
import { X, MapPin, CreditCard, Loader2, Upload, CheckCircle, Copy, Image } from "lucide-react";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  selected_color?: string;
  selected_attributes?: Record<string, string>;
}

interface DeliveryInfo {
  address: string;
  lat: number | null;
  lng: number | null;
  customerName: string;
  customerPhone: string;
}

interface CheckoutModalProps {
  isOpen: boolean;
  items: OrderItem[];
  total: number;
  onClose: () => void;
  onPaymentSelect: (paymentMethod: string, deliveryInfo: DeliveryInfo, receiptUrl?: string) => Promise<string | null>;
}

declare global {
  interface Window {
    ymaps: any;
  }
}

export default function CheckoutModal({
  isOpen,
  items,
  total,
  onClose,
  onPaymentSelect,
}: CheckoutModalProps) {
  const { config, formatPrice } = useConfig();
  const [step, setStep] = useState<'delivery' | 'payment' | 'card_transfer'>('delivery');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    address: '',
    lat: null,
    lng: null,
    customerName: '',
    customerPhone: '',
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const placemarkerRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('delivery');
      setSelectedPayment(null);
      setReceiptUrl(null);
      setOrderSuccess(false);
      setDeliveryInfo({
        address: '',
        lat: null,
        lng: null,
        customerName: '',
        customerPhone: '',
      });
      return;
    }

    const yandexApiKey = config?.yandexMaps?.apiKey;
    if (!yandexApiKey) {
      setMapError('API ключ Yandex Maps не настроен');
      return;
    }

    if (window.ymaps) {
      initMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${yandexApiKey}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      window.ymaps.ready(() => {
        setMapLoaded(true);
        initMap();
      });
    };
    script.onerror = () => {
      setMapError('Ошибка загрузки Yandex Maps');
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, config?.yandexMaps?.apiKey]);

  const initMap = () => {
    if (!mapContainerRef.current || !window.ymaps) return;

    const defaultCenter = config?.yandexMaps?.defaultCenter || [41.311081, 69.240562];
    const defaultZoom = config?.yandexMaps?.defaultZoom || 12;

    try {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
      }

      mapInstanceRef.current = new window.ymaps.Map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        controls: ['zoomControl', 'geolocationControl'],
      });

      placemarkerRef.current = new window.ymaps.Placemark(
        defaultCenter,
        { hintContent: 'Переместите маркер на адрес доставки' },
        { draggable: true, preset: 'islands#redDotIcon' }
      );

      mapInstanceRef.current.geoObjects.add(placemarkerRef.current);

      placemarkerRef.current.events.add('dragend', async function () {
        const coords = placemarkerRef.current.geometry.getCoordinates();
        await geocodeCoords(coords);
      });

      mapInstanceRef.current.events.add('click', async function (e: any) {
        const coords = e.get('coords');
        placemarkerRef.current.geometry.setCoordinates(coords);
        await geocodeCoords(coords);
      });

      setMapLoaded(true);
    } catch (error) {
      console.error('Map initialization error:', error);
      setMapError('Ошибка инициализации карты');
    }
  };

  const geocodeCoords = async (coords: [number, number]) => {
    try {
      const result = await window.ymaps.geocode(coords);
      const firstGeoObject = result.geoObjects.get(0);
      const address = firstGeoObject.getAddressLine();
      
      setDeliveryInfo(prev => ({
        ...prev,
        address,
        lat: coords[0],
        lng: coords[1],
      }));
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  };

  const handleAddressSearch = async () => {
    if (!deliveryInfo.address || !window.ymaps) return;

    try {
      const result = await window.ymaps.geocode(deliveryInfo.address);
      const firstGeoObject = result.geoObjects.get(0);
      
      if (firstGeoObject) {
        const coords = firstGeoObject.geometry.getCoordinates();
        const address = firstGeoObject.getAddressLine();
        
        placemarkerRef.current?.geometry.setCoordinates(coords);
        mapInstanceRef.current?.setCenter(coords, 16);
        
        setDeliveryInfo(prev => ({
          ...prev,
          address,
          lat: coords[0],
          lng: coords[1],
        }));
      }
    } catch (error) {
      console.error('Address search error:', error);
    }
  };

  const handleContinueToPayment = () => {
    if (!deliveryInfo.address || !deliveryInfo.customerName || !deliveryInfo.customerPhone) {
      return;
    }
    setStep('payment');
  };

  const handlePayment = async (method: string) => {
    if (method === 'card_transfer') {
      setStep('card_transfer');
      return;
    }
    
    setIsLoading(true);
    setSelectedPayment(method);
    
    try {
      const paymentUrl = await onPaymentSelect(method, deliveryInfo);
      
      if (paymentUrl) {
        window.location.href = paymentUrl;
      }
    } catch (error) {
      console.error('Payment error:', error);
      setIsLoading(false);
      setSelectedPayment(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingReceipt(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/receipt', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setReceiptUrl(data.secure_url);
    } catch (error: any) {
      console.error('Error uploading receipt:', error);
      alert(error.message || 'Ошибка загрузки чека. Попробуйте еще раз.');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleCardTransferSubmit = async () => {
    if (!receiptUrl) {
      alert('Пожалуйста, загрузите фото чека оплаты');
      return;
    }

    setIsLoading(true);
    setSelectedPayment('card_transfer');

    try {
      await onPaymentSelect('card_transfer', deliveryInfo, receiptUrl);
      setOrderSuccess(true);
    } catch (error) {
      console.error('Order error:', error);
      alert('Ошибка при создании заказа');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!isOpen) return null;

  const isDeliveryValid = deliveryInfo.address && deliveryInfo.customerName && deliveryInfo.customerPhone;

  const clickConfig = config?.payment?.click;
  const paymeConfig = config?.payment?.payme;
  const uzumConfig = config?.payment?.uzum;
  const cardTransferConfig = config?.payment?.cardTransfer;

  const isClickAvailable = clickConfig?.enabled !== false && clickConfig?.merchantId && clickConfig?.serviceId;
  const isPaymeAvailable = paymeConfig?.enabled !== false && paymeConfig?.merchantId;
  const isUzumAvailable = uzumConfig?.enabled !== false && uzumConfig?.merchantId;
  const isCardTransferAvailable = cardTransferConfig?.enabled !== false && cardTransferConfig?.cardNumber;

  const hasAnyPaymentMethod = isClickAvailable || isPaymeAvailable || isUzumAvailable || isCardTransferAvailable;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {step === 'delivery' ? 'Адрес доставки' : step === 'payment' ? 'Способ оплаты' : 'Оплата переводом'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4">
          {step === 'delivery' ? (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 mb-4">
                <div className="text-sm text-muted-foreground mb-1">Сумма заказа:</div>
                <div className="text-xl font-bold text-primary">{formatPrice(total)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {config?.delivery?.freeDeliveryNote || 'Доставка оплачивается при получении'}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="customerName">Ваше имя *</Label>
                  <Input
                    id="customerName"
                    placeholder="Введите ваше имя"
                    value={deliveryInfo.customerName}
                    onChange={(e) => setDeliveryInfo(prev => ({ ...prev, customerName: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="customerPhone">Телефон *</Label>
                  <Input
                    id="customerPhone"
                    placeholder="+998 90 123 45 67"
                    value={deliveryInfo.customerPhone}
                    onChange={(e) => setDeliveryInfo(prev => ({ ...prev, customerPhone: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="address">Адрес доставки *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="address"
                      placeholder="Введите адрес"
                      value={deliveryInfo.address}
                      onChange={(e) => setDeliveryInfo(prev => ({ ...prev, address: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                    />
                    <Button variant="outline" onClick={handleAddressSearch}>
                      <MapPin className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border-2 border-primary/20 shadow-lg bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-slate-900/50 dark:to-slate-800/50">
                  <div className="absolute top-3 left-3 z-10 bg-background/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-border">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span>Укажите точку доставки</span>
                    </div>
                  </div>
                  
                  {mapError ? (
                    <div className="h-[300px] flex flex-col items-center justify-center bg-muted/50 text-muted-foreground">
                      <MapPin className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm font-medium">{mapError}</p>
                      <p className="text-xs mt-1">Проверьте настройки API ключа</p>
                    </div>
                  ) : !mapLoaded ? (
                    <div className="h-[300px] flex flex-col items-center justify-center bg-muted/30">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                      <p className="text-sm text-muted-foreground">Загрузка карты...</p>
                    </div>
                  ) : (
                    <div
                      ref={mapContainerRef}
                      className="h-[300px] w-full"
                      style={{ minHeight: '300px' }}
                    />
                  )}
                  
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-3 pointer-events-none">
                    <p className="text-xs text-muted-foreground text-center">
                      Нажмите на карту или перетащите маркер для выбора адреса
                    </p>
                  </div>
                </div>

                {deliveryInfo.lat && deliveryInfo.lng && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
                        Адрес выбран
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {deliveryInfo.lat.toFixed(6)}, {deliveryInfo.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleContinueToPayment}
                className="w-full mt-4"
                disabled={!isDeliveryValid}
              >
                Перейти к оплате
              </Button>
            </div>
          ) : step === 'payment' ? (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">К оплате:</span>
                  <span className="text-xl font-bold text-primary">{formatPrice(total)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Доставка: {deliveryInfo.address}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="text-sm font-medium mb-2">Ваш заказ:</div>
                {items.map((item, index) => (
                  <div key={index} className="text-sm text-muted-foreground flex justify-between">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {!hasAnyPaymentMethod ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Способы оплаты не настроены</p>
                  <p className="text-sm">Свяжитесь с администратором</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Выберите способ оплаты:</div>

                  {isClickAvailable && (
                    <Button
                      variant="outline"
                      className="w-full h-14 justify-start gap-3 hover:border-primary"
                      onClick={() => handlePayment('click')}
                      disabled={isLoading}
                    >
                      {isLoading && selectedPayment === 'click' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#00AEEF] flex items-center justify-center">
                          <span className="text-white font-bold text-xs">CLICK</span>
                        </div>
                      )}
                      <div className="text-left">
                        <div className="font-medium">Click</div>
                        <div className="text-xs text-muted-foreground">Оплата через Click</div>
                      </div>
                    </Button>
                  )}

                  {isPaymeAvailable && (
                    <Button
                      variant="outline"
                      className="w-full h-14 justify-start gap-3 hover:border-primary"
                      onClick={() => handlePayment('payme')}
                      disabled={isLoading}
                    >
                      {isLoading && selectedPayment === 'payme' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#00CDBE] flex items-center justify-center">
                          <span className="text-white font-bold text-xs">Payme</span>
                        </div>
                      )}
                      <div className="text-left">
                        <div className="font-medium">Payme</div>
                        <div className="text-xs text-muted-foreground">Оплата через Payme</div>
                      </div>
                    </Button>
                  )}

                  {isUzumAvailable && (
                    <Button
                      variant="outline"
                      className="w-full h-14 justify-start gap-3 hover:border-primary"
                      onClick={() => handlePayment('uzum')}
                      disabled={isLoading}
                    >
                      {isLoading && selectedPayment === 'uzum' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#7B68EE] flex items-center justify-center">
                          <span className="text-white font-bold text-xs">Uzum</span>
                        </div>
                      )}
                      <div className="text-left">
                        <div className="font-medium">Uzum Bank</div>
                        <div className="text-xs text-muted-foreground">Оплата через Uzum</div>
                      </div>
                    </Button>
                  )}

                  {isCardTransferAvailable && (
                    <Button
                      variant="outline"
                      className="w-full h-14 justify-start gap-3 hover:border-primary"
                      onClick={() => handlePayment('card_transfer')}
                      disabled={isLoading}
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Перевод на карту</div>
                        <div className="text-xs text-muted-foreground">Оплата переводом</div>
                      </div>
                    </Button>
                  )}
                </div>
              )}

              <Button
                variant="ghost"
                onClick={() => setStep('delivery')}
                className="w-full mt-2"
              >
                ← Вернуться к адресу
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {orderSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">Заказ оформлен!</h3>
                  <p className="text-muted-foreground mb-4">
                    Ваш заказ принят. После проверки оплаты мы свяжемся с вами.
                  </p>
                  <Button onClick={onClose} className="w-full">
                    Закрыть
                  </Button>
                </div>
              ) : (
                <>
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-center mb-3">
                      <div className="text-sm text-muted-foreground">К оплате:</div>
                      <div className="text-2xl font-bold text-primary">{formatPrice(total)}</div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-green-600" />
                      Реквизиты для перевода
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white dark:bg-background rounded-lg p-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Номер карты</div>
                          <div className="font-mono font-bold text-lg">
                            {cardTransferConfig?.cardNumber?.replace(/(\d{4})/g, '$1 ').trim()}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(cardTransferConfig?.cardNumber || '', 'card')}
                        >
                          {copiedField === 'card' ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>

                      {cardTransferConfig?.cardHolder && (
                        <div className="bg-white dark:bg-background rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">Получатель</div>
                          <div className="font-medium">{cardTransferConfig.cardHolder}</div>
                        </div>
                      )}

                      {cardTransferConfig?.bankName && (
                        <div className="bg-white dark:bg-background rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">Банк</div>
                          <div className="font-medium">{cardTransferConfig.bankName}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      Загрузите фото чека оплаты *
                    </Label>
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />

                    {receiptUrl ? (
                      <div className="relative">
                        <img
                          src={receiptUrl}
                          alt="Чек оплаты"
                          className="w-full h-48 object-cover rounded-lg border"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() => {
                            setReceiptUrl(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Загружено
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full h-32 border-dashed flex flex-col gap-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingReceipt}
                      >
                        {isUploadingReceipt ? (
                          <>
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span>Загрузка...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8" />
                            <span>Нажмите чтобы загрузить фото чека</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <Button
                    onClick={handleCardTransferSubmit}
                    className="w-full"
                    disabled={!receiptUrl || isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Оформление...
                      </>
                    ) : (
                      'Подтвердить оплату'
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => setStep('payment')}
                    className="w-full"
                    disabled={isLoading}
                  >
                    ← Выбрать другой способ оплаты
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
