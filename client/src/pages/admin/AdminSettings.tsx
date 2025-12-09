import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cloud, Eye, EyeOff, Check, X, Loader2, Send, CreditCard, MapPin, Mail } from 'lucide-react';

interface CloudinarySettings {
  cloud_name: string;
  api_key: string;
  has_api_secret: boolean;
}

interface TelegramSettings {
  has_bot_token: boolean;
  admin_chat_id: string;
  notifications_enabled: boolean;
}

interface PaymentSettings {
  click: {
    merchant_id: string;
    service_id: string;
    has_secret_key: boolean;
    enabled: boolean;
  };
  payme: {
    merchant_id: string;
    has_key: boolean;
    enabled: boolean;
  };
  uzum: {
    merchant_id: string;
    service_id: string;
    has_secret_key: boolean;
    enabled: boolean;
  };
  card_transfer: {
    card_number: string;
    card_holder: string;
    bank_name: string;
    enabled: boolean;
  };
}

interface YandexMapsSettings {
  api_key: string;
  default_lat: string;
  default_lng: string;
  default_zoom: string;
}

interface SmtpSettings {
  host: string;
  port: string;
  user: string;
  has_password: boolean;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  
  const [cloudinary, setCloudinary] = useState<CloudinarySettings>({
    cloud_name: '',
    api_key: '',
    has_api_secret: false
  });
  const [cloudinarySecret, setCloudinarySecret] = useState('');
  const [showCloudinarySecret, setShowCloudinarySecret] = useState(false);
  
  const [telegram, setTelegram] = useState<TelegramSettings>({
    has_bot_token: false,
    admin_chat_id: '',
    notifications_enabled: false
  });
  const [telegramToken, setTelegramToken] = useState('');
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  
  const [payments, setPayments] = useState<PaymentSettings>({
    click: { merchant_id: '', service_id: '', has_secret_key: false, enabled: false },
    payme: { merchant_id: '', has_key: false, enabled: false },
    uzum: { merchant_id: '', service_id: '', has_secret_key: false, enabled: false },
    card_transfer: { card_number: '', card_holder: '', bank_name: '', enabled: false }
  });
  const [clickSecretKey, setClickSecretKey] = useState('');
  const [paymeKey, setPaymeKey] = useState('');
  const [uzumSecretKey, setUzumSecretKey] = useState('');
  
  const [yandexMaps, setYandexMaps] = useState<YandexMapsSettings>({
    api_key: '',
    default_lat: '41.311081',
    default_lng: '69.240562',
    default_zoom: '12'
  });
  
  const [smtp, setSmtp] = useState<SmtpSettings>({
    host: '',
    port: '587',
    user: '',
    has_password: false,
    from_email: '',
    from_name: '',
    use_tls: true
  });
  const [smtpPassword, setSmtpPassword] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ key: string; success: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    loadAllSettings();
  }, []);

  const loadAllSettings = async () => {
    try {
      const [cloudinaryRes, telegramRes, paymentsRes, yandexRes, smtpRes] = await Promise.all([
        fetch('/api/admin/settings/cloudinary'),
        fetch('/api/admin/settings/telegram'),
        fetch('/api/admin/settings/payments'),
        fetch('/api/admin/settings/yandex_maps'),
        fetch('/api/admin/settings/smtp')
      ]);
      
      if (cloudinaryRes.ok) setCloudinary(await cloudinaryRes.json());
      if (telegramRes.ok) setTelegram(await telegramRes.json());
      if (paymentsRes.ok) setPayments(await paymentsRes.json());
      if (yandexRes.ok) setYandexMaps(await yandexRes.json());
      if (smtpRes.ok) setSmtp(await smtpRes.json());
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const showSaveMessage = (key: string, message: string, isError = false) => {
    setSaveMessage({ key, message: isError ? `Ошибка: ${message}` : message });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleSaveCloudinary = async () => {
    setSaving('cloudinary');
    try {
      const payload: any = {
        cloud_name: cloudinary.cloud_name,
        api_key: cloudinary.api_key
      };
      if (cloudinarySecret) payload.api_secret = cloudinarySecret;
      
      const response = await fetch('/api/admin/settings/cloudinary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        showSaveMessage('cloudinary', 'Настройки сохранены');
        setCloudinarySecret('');
        loadAllSettings();
      } else {
        const data = await response.json();
        showSaveMessage('cloudinary', data.error, true);
      }
    } catch (error) {
      showSaveMessage('cloudinary', 'Ошибка сохранения', true);
    } finally {
      setSaving(null);
    }
  };

  const handleTestCloudinary = async () => {
    setTesting('cloudinary');
    setTestResult(null);
    try {
      const response = await fetch('/api/admin/settings/cloudinary/test', { method: 'POST' });
      const data = await response.json();
      setTestResult({ key: 'cloudinary', success: data.success, message: data.success ? data.message : data.error });
    } catch (error) {
      setTestResult({ key: 'cloudinary', success: false, message: 'Ошибка проверки' });
    } finally {
      setTesting(null);
    }
  };

  const handleSaveTelegram = async () => {
    setSaving('telegram');
    try {
      const payload: any = {
        admin_chat_id: telegram.admin_chat_id,
        notifications_enabled: telegram.notifications_enabled
      };
      if (telegramToken) payload.bot_token = telegramToken;
      
      const response = await fetch('/api/admin/settings/telegram', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        showSaveMessage('telegram', 'Настройки сохранены');
        setTelegramToken('');
        loadAllSettings();
      } else {
        const data = await response.json();
        showSaveMessage('telegram', data.error, true);
      }
    } catch (error) {
      showSaveMessage('telegram', 'Ошибка сохранения', true);
    } finally {
      setSaving(null);
    }
  };

  const handleTestTelegram = async () => {
    setTesting('telegram');
    setTestResult(null);
    try {
      const response = await fetch('/api/admin/settings/telegram/test', { method: 'POST' });
      const data = await response.json();
      setTestResult({ key: 'telegram', success: data.success, message: data.success ? data.message : data.error });
    } catch (error) {
      setTestResult({ key: 'telegram', success: false, message: 'Ошибка проверки' });
    } finally {
      setTesting(null);
    }
  };

  const handleSavePayment = async (provider: string) => {
    setSaving(provider);
    try {
      let payload: any = {};
      let endpoint = `/api/admin/settings/payments/${provider}`;
      
      if (provider === 'click') {
        payload = {
          merchant_id: payments.click.merchant_id,
          service_id: payments.click.service_id,
          enabled: payments.click.enabled
        };
        if (clickSecretKey) payload.secret_key = clickSecretKey;
      } else if (provider === 'payme') {
        payload = {
          merchant_id: payments.payme.merchant_id,
          enabled: payments.payme.enabled
        };
        if (paymeKey) payload.key = paymeKey;
      } else if (provider === 'uzum') {
        payload = {
          merchant_id: payments.uzum.merchant_id,
          service_id: payments.uzum.service_id,
          enabled: payments.uzum.enabled
        };
        if (uzumSecretKey) payload.secret_key = uzumSecretKey;
      } else if (provider === 'card_transfer') {
        payload = {
          card_number: payments.card_transfer.card_number,
          card_holder: payments.card_transfer.card_holder,
          bank_name: payments.card_transfer.bank_name,
          enabled: payments.card_transfer.enabled
        };
      }
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        showSaveMessage(provider, 'Настройки сохранены');
        setClickSecretKey('');
        setPaymeKey('');
        setUzumSecretKey('');
        loadAllSettings();
      } else {
        const data = await response.json();
        showSaveMessage(provider, data.error, true);
      }
    } catch (error) {
      showSaveMessage(provider, 'Ошибка сохранения', true);
    } finally {
      setSaving(null);
    }
  };

  const handleSaveYandexMaps = async () => {
    setSaving('yandex');
    try {
      const response = await fetch('/api/admin/settings/yandex_maps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(yandexMaps)
      });
      
      if (response.ok) {
        showSaveMessage('yandex', 'Настройки сохранены');
      } else {
        const data = await response.json();
        showSaveMessage('yandex', data.error, true);
      }
    } catch (error) {
      showSaveMessage('yandex', 'Ошибка сохранения', true);
    } finally {
      setSaving(null);
    }
  };

  const handleTestYandexMaps = async () => {
    setTesting('yandex');
    setTestResult(null);
    try {
      const response = await fetch('/api/admin/settings/yandex_maps/test', { method: 'POST' });
      const data = await response.json();
      setTestResult({ key: 'yandex', success: data.success, message: data.success ? data.message : data.error });
    } catch (error) {
      setTestResult({ key: 'yandex', success: false, message: 'Ошибка проверки' });
    } finally {
      setTesting(null);
    }
  };

  const handleSaveSmtp = async () => {
    setSaving('smtp');
    try {
      const payload: any = {
        host: smtp.host,
        port: smtp.port,
        user: smtp.user,
        from_email: smtp.from_email,
        from_name: smtp.from_name,
        use_tls: smtp.use_tls
      };
      if (smtpPassword) payload.password = smtpPassword;
      
      const response = await fetch('/api/admin/settings/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        showSaveMessage('smtp', 'Настройки сохранены');
        setSmtpPassword('');
        loadAllSettings();
      } else {
        const data = await response.json();
        showSaveMessage('smtp', data.error, true);
      }
    } catch (error) {
      showSaveMessage('smtp', 'Ошибка сохранения', true);
    } finally {
      setSaving(null);
    }
  };

  const handleTestSmtp = async () => {
    setTesting('smtp');
    setTestResult(null);
    try {
      const response = await fetch('/api/admin/settings/smtp/test', { method: 'POST' });
      const data = await response.json();
      setTestResult({ key: 'smtp', success: data.success, message: data.success ? data.message : data.error });
    } catch (error) {
      setTestResult({ key: 'smtp', success: false, message: 'Ошибка проверки' });
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-hidden">
      <Tabs defaultValue="telegram" className="w-full overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <TabsList className="inline-flex w-max min-w-full sm:w-full sm:grid sm:grid-cols-5 gap-1">
            <TabsTrigger value="telegram" className="whitespace-nowrap px-3 text-xs sm:text-sm">Telegram</TabsTrigger>
            <TabsTrigger value="smtp" className="whitespace-nowrap px-3 text-xs sm:text-sm">SMTP</TabsTrigger>
            <TabsTrigger value="cloudinary" className="whitespace-nowrap px-3 text-xs sm:text-sm">Cloudinary</TabsTrigger>
            <TabsTrigger value="payments" className="whitespace-nowrap px-3 text-xs sm:text-sm">Платежи</TabsTrigger>
            <TabsTrigger value="maps" className="whitespace-nowrap px-3 text-xs sm:text-sm">Карты</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="telegram" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Telegram уведомления
              </CardTitle>
              <CardDescription>
                Настройки бота для отправки уведомлений о новых заказах
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Уведомления включены</Label>
                  <p className="text-sm text-muted-foreground">Отправлять уведомления о новых заказах</p>
                </div>
                <Switch
                  checked={telegram.notifications_enabled}
                  onCheckedChange={(checked) => setTelegram({ ...telegram, notifications_enabled: checked })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bot_token">
                  Bot Token
                  {telegram.has_bot_token && (
                    <span className="ml-2 text-xs text-green-600">(установлен)</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="bot_token"
                    type={showTelegramToken ? 'text' : 'password'}
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder={telegram.has_bot_token ? '••••••••••••••••' : 'Bot Token от @BotFather'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowTelegramToken(!showTelegramToken)}
                  >
                    {showTelegramToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin_chat_id">Chat ID для уведомлений</Label>
                <Input
                  id="admin_chat_id"
                  value={telegram.admin_chat_id}
                  onChange={(e) => setTelegram({ ...telegram, admin_chat_id: e.target.value })}
                  placeholder="Ваш Telegram ID или ID группы"
                />
                <p className="text-xs text-muted-foreground">
                  Получить ID можно через @userinfobot
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <Button onClick={handleSaveTelegram} disabled={saving === 'telegram'} className="w-full sm:w-auto">
                  {saving === 'telegram' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить'}
                </Button>
                <Button variant="outline" onClick={handleTestTelegram} disabled={testing === 'telegram'} className="w-full sm:w-auto">
                  {testing === 'telegram' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Отправка...</> : 'Тест'}
                </Button>
              </div>
              
              {saveMessage?.key === 'telegram' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
              
              {testResult?.key === 'telegram' && (
                <div className={`flex items-center gap-2 p-3 rounded-md ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  <span className="text-sm">{testResult.message}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="smtp" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                SMTP (Email)
              </CardTitle>
              <CardDescription>
                Настройки для отправки писем (восстановление пароля)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp_host">SMTP Host</Label>
                  <Input
                    id="smtp_host"
                    value={smtp.host}
                    onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_port">Port</Label>
                  <Input
                    id="smtp_port"
                    value={smtp.port}
                    onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                    placeholder="587"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="smtp_user">Email (логин)</Label>
                <Input
                  id="smtp_user"
                  type="email"
                  value={smtp.user}
                  onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                  placeholder="your-email@gmail.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="smtp_password">
                  Пароль
                  {smtp.has_password && (
                    <span className="ml-2 text-xs text-green-600">(установлен)</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="smtp_password"
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={smtp.has_password ? '••••••••••••••••' : 'Пароль приложения'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                  >
                    {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp_from_email">Email отправителя</Label>
                  <Input
                    id="smtp_from_email"
                    type="email"
                    value={smtp.from_email}
                    onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
                    placeholder="noreply@yoursite.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_from_name">Имя отправителя</Label>
                  <Input
                    id="smtp_from_name"
                    value={smtp.from_name}
                    onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })}
                    placeholder="Monvoir"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Использовать TLS</Label>
                  <p className="text-sm text-muted-foreground">Рекомендуется для безопасности</p>
                </div>
                <Switch
                  checked={smtp.use_tls}
                  onCheckedChange={(checked) => setSmtp({ ...smtp, use_tls: checked })}
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <Button onClick={handleSaveSmtp} disabled={saving === 'smtp'} className="w-full sm:w-auto">
                  {saving === 'smtp' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить'}
                </Button>
                <Button variant="outline" onClick={handleTestSmtp} disabled={testing === 'smtp'} className="w-full sm:w-auto">
                  {testing === 'smtp' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Отправка...</> : 'Тест'}
                </Button>
              </div>
              
              {saveMessage?.key === 'smtp' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
              
              {testResult?.key === 'smtp' && (
                <div className={`flex items-center gap-2 p-3 rounded-md ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  <span className="text-sm">{testResult.message}</span>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Настройка SMTP для Gmail</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>1. Включите двухфакторную аутентификацию в Google</p>
              <p>2. Перейдите: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary underline">Пароли приложений</a></p>
              <p>3. Создайте пароль для "Почта" и используйте его здесь</p>
              <p className="pt-2"><strong>Host:</strong> smtp.gmail.com, <strong>Port:</strong> 587</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="cloudinary" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Cloudinary
              </CardTitle>
              <CardDescription>
                Облачное хранилище для изображений товаров
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cloud_name">Cloud Name</Label>
                <Input
                  id="cloud_name"
                  value={cloudinary.cloud_name}
                  onChange={(e) => setCloudinary({ ...cloudinary, cloud_name: e.target.value })}
                  placeholder="your-cloud-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="api_key">API Key</Label>
                <Input
                  id="api_key"
                  value={cloudinary.api_key}
                  onChange={(e) => setCloudinary({ ...cloudinary, api_key: e.target.value })}
                  placeholder="123456789012345"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="api_secret">
                  API Secret
                  {cloudinary.has_api_secret && (
                    <span className="ml-2 text-xs text-green-600">(установлен)</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="api_secret"
                    type={showCloudinarySecret ? 'text' : 'password'}
                    value={cloudinarySecret}
                    onChange={(e) => setCloudinarySecret(e.target.value)}
                    placeholder={cloudinary.has_api_secret ? '••••••••••••••••' : 'API Secret'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowCloudinarySecret(!showCloudinarySecret)}
                  >
                    {showCloudinarySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <Button onClick={handleSaveCloudinary} disabled={saving === 'cloudinary'} className="w-full sm:w-auto">
                  {saving === 'cloudinary' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить'}
                </Button>
                <Button variant="outline" onClick={handleTestCloudinary} disabled={testing === 'cloudinary'} className="w-full sm:w-auto">
                  {testing === 'cloudinary' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Проверка...</> : 'Проверить'}
                </Button>
              </div>
              
              {saveMessage?.key === 'cloudinary' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
              
              {testResult?.key === 'cloudinary' && (
                <div className={`flex items-center gap-2 p-3 rounded-md ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  <span className="text-sm">{testResult.message}</span>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Как получить данные Cloudinary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>1. Зарегистрируйтесь на <a href="https://cloudinary.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">cloudinary.com</a></p>
              <p>2. Перейдите в Dashboard</p>
              <p>3. Скопируйте Cloud Name, API Key и API Secret</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="payments" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Click
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Включено</Label>
                <Switch
                  checked={payments.click.enabled}
                  onCheckedChange={(checked) => setPayments({
                    ...payments,
                    click: { ...payments.click, enabled: checked }
                  })}
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Merchant ID</Label>
                  <Input
                    value={payments.click.merchant_id}
                    onChange={(e) => setPayments({
                      ...payments,
                      click: { ...payments.click, merchant_id: e.target.value }
                    })}
                    placeholder="Merchant ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Service ID</Label>
                  <Input
                    value={payments.click.service_id}
                    onChange={(e) => setPayments({
                      ...payments,
                      click: { ...payments.click, service_id: e.target.value }
                    })}
                    placeholder="Service ID"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>
                  Secret Key
                  {payments.click.has_secret_key && <span className="ml-2 text-xs text-green-600">(установлен)</span>}
                </Label>
                <Input
                  type="password"
                  value={clickSecretKey}
                  onChange={(e) => setClickSecretKey(e.target.value)}
                  placeholder={payments.click.has_secret_key ? '••••••••' : 'Secret Key'}
                />
              </div>
              
              <Button onClick={() => handleSavePayment('click')} disabled={saving === 'click'}>
                {saving === 'click' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить Click'}
              </Button>
              
              {saveMessage?.key === 'click' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Включено</Label>
                <Switch
                  checked={payments.payme.enabled}
                  onCheckedChange={(checked) => setPayments({
                    ...payments,
                    payme: { ...payments.payme, enabled: checked }
                  })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Merchant ID</Label>
                <Input
                  value={payments.payme.merchant_id}
                  onChange={(e) => setPayments({
                    ...payments,
                    payme: { ...payments.payme, merchant_id: e.target.value }
                  })}
                  placeholder="Merchant ID"
                />
              </div>
              
              <div className="space-y-2">
                <Label>
                  Secret Key
                  {payments.payme.has_key && <span className="ml-2 text-xs text-green-600">(установлен)</span>}
                </Label>
                <Input
                  type="password"
                  value={paymeKey}
                  onChange={(e) => setPaymeKey(e.target.value)}
                  placeholder={payments.payme.has_key ? '••••••••' : 'Secret Key'}
                />
              </div>
              
              <Button onClick={() => handleSavePayment('payme')} disabled={saving === 'payme'}>
                {saving === 'payme' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить Payme'}
              </Button>
              
              {saveMessage?.key === 'payme' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Uzum Bank
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Включено</Label>
                <Switch
                  checked={payments.uzum.enabled}
                  onCheckedChange={(checked) => setPayments({
                    ...payments,
                    uzum: { ...payments.uzum, enabled: checked }
                  })}
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 min-w-0">
                  <Label>Merchant ID</Label>
                  <Input
                    value={payments.uzum.merchant_id}
                    onChange={(e) => setPayments({
                      ...payments,
                      uzum: { ...payments.uzum, merchant_id: e.target.value }
                    })}
                    placeholder="Merchant ID"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>Service ID</Label>
                  <Input
                    value={payments.uzum.service_id}
                    onChange={(e) => setPayments({
                      ...payments,
                      uzum: { ...payments.uzum, service_id: e.target.value }
                    })}
                    placeholder="Service ID"
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>
                  Secret Key
                  {payments.uzum.has_secret_key && <span className="ml-2 text-xs text-green-600">(установлен)</span>}
                </Label>
                <Input
                  type="password"
                  value={uzumSecretKey}
                  onChange={(e) => setUzumSecretKey(e.target.value)}
                  placeholder={payments.uzum.has_secret_key ? '••••••••' : 'Secret Key'}
                />
              </div>
              
              <Button onClick={() => handleSavePayment('uzum')} disabled={saving === 'uzum'}>
                {saving === 'uzum' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить Uzum'}
              </Button>
              
              {saveMessage?.key === 'uzum' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Перевод на карту
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Включено</Label>
                <Switch
                  checked={payments.card_transfer.enabled}
                  onCheckedChange={(checked) => setPayments({
                    ...payments,
                    card_transfer: { ...payments.card_transfer, enabled: checked }
                  })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Номер карты</Label>
                <Input
                  value={payments.card_transfer.card_number}
                  onChange={(e) => setPayments({
                    ...payments,
                    card_transfer: { ...payments.card_transfer, card_number: e.target.value }
                  })}
                  placeholder="8600 1234 5678 9012"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 min-w-0">
                  <Label>Имя держателя карты</Label>
                  <Input
                    value={payments.card_transfer.card_holder}
                    onChange={(e) => setPayments({
                      ...payments,
                      card_transfer: { ...payments.card_transfer, card_holder: e.target.value }
                    })}
                    placeholder="IVAN IVANOV"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>Название банка</Label>
                  <Input
                    value={payments.card_transfer.bank_name}
                    onChange={(e) => setPayments({
                      ...payments,
                      card_transfer: { ...payments.card_transfer, bank_name: e.target.value }
                    })}
                    placeholder="Uzcard / Humo"
                    className="w-full"
                  />
                </div>
              </div>
              
              <Button onClick={() => handleSavePayment('card_transfer')} disabled={saving === 'card_transfer'}>
                {saving === 'card_transfer' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить'}
              </Button>
              
              {saveMessage?.key === 'card_transfer' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="maps" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Яндекс.Карты
              </CardTitle>
              <CardDescription>
                Для выбора адреса доставки при оформлении заказа
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="yandex_api_key">API ключ</Label>
                <Input
                  id="yandex_api_key"
                  value={yandexMaps.api_key}
                  onChange={(e) => setYandexMaps({ ...yandexMaps, api_key: e.target.value })}
                  placeholder="Ваш API ключ Яндекс.Карт"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 min-w-0">
                  <Label>Широта</Label>
                  <Input
                    value={yandexMaps.default_lat}
                    onChange={(e) => setYandexMaps({ ...yandexMaps, default_lat: e.target.value })}
                    placeholder="41.311081"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>Долгота</Label>
                  <Input
                    value={yandexMaps.default_lng}
                    onChange={(e) => setYandexMaps({ ...yandexMaps, default_lng: e.target.value })}
                    placeholder="69.240562"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>Зум</Label>
                  <Input
                    value={yandexMaps.default_zoom}
                    onChange={(e) => setYandexMaps({ ...yandexMaps, default_zoom: e.target.value })}
                    placeholder="12"
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <Button onClick={handleSaveYandexMaps} disabled={saving === 'yandex'} className="w-full sm:w-auto">
                  {saving === 'yandex' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить'}
                </Button>
                <Button variant="outline" onClick={handleTestYandexMaps} disabled={testing === 'yandex'} className="w-full sm:w-auto">
                  {testing === 'yandex' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Проверка...</> : 'Проверить'}
                </Button>
              </div>
              
              {saveMessage?.key === 'yandex' && (
                <p className={`text-sm ${saveMessage.message.includes('Ошибка') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage.message}
                </p>
              )}
              
              {testResult?.key === 'yandex' && (
                <div className={`flex items-center gap-2 p-3 rounded-md ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  <span className="text-sm">{testResult.message}</span>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Как получить API ключ Яндекс.Карт</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>1. Перейдите в <a href="https://developer.tech.yandex.ru/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Кабинет разработчика Яндекс</a></p>
              <p>2. Создайте новый проект</p>
              <p>3. Подключите API JavaScript Карты</p>
              <p>4. Скопируйте API ключ</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
