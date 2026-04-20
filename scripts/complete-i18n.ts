import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');

const translations: Record<string, any> = {
  fr: {
    "sidebar.assistant": "Assistant",
    "sidebar.exports": "Exportations",
    "libraries.libraryCard.pin": "Épingler la bibliothèque",
    "libraries.libraryCard.unpin": "Désépingler la bibliothèque",
    "libraries.pinLimitReached": "Vous pouvez épingler au maximum {{max}} bibliothèques.",
    "projectViewer.common.imageShort": "Image",
    "projectViewer.common.prompt": "Invite",
    "projectViewer.common.audio": "Audio",
    "projectViewer.tabs.album": "Album",
    "projectViewer.tabs.audios": "Audios",
    "projectViewer.queue.contextShort": "Ctx",
    "accountTwoFactorSetup": {
      "backToSecurity": "Retour à la sécurité",
      "title": "Configuration de la 2FA",
      "description": "Configurez votre application d'authentification pour {{email}}.",
      "thisAccount": "ce compte",
      "enabled": "Activé",
      "currentPassword": "Mot de passe actuel",
      "scanQr": "Scanner le code QR",
      "qrAlt": "Code QR d'authentification à deux facteurs",
      "qrUnavailable": "QR non disponible",
      "expiresAt": "Expire à {{time}}.",
      "openOtpauth": "Ouvrir l'URI otpauth",
      "verificationCode": "Code de vérification",
      "enable": "Activer la 2FA",
      "step1": {
        "title": "Étape 1 : Générer le secret de l'authentificateur",
        "withPassword": "Confirmez votre mot de passe avant de créer une nouvelle configuration 2FA.",
        "noPassword": "Générez un nouveau secret d'authentificateur pour votre compte.",
        "action": "Générer le secret"
      },
      "step2": {
        "title": "Étape 2 : Scanner et vérifier",
        "description": "Scannez le code QR avec Google Authenticator, 1Password, Authy ou une autre application TOTP. Si le balayage n'est pas disponible, saisissez manuellement la clé de configuration."
      }
    }
  },
  ja: {
    "libraries.libraryCard.pin": "ライブラリを固定",
    "libraries.libraryCard.unpin": "固定を解除",
    "libraries.pinLimitReached": "最大 {{max}} 個のライブラリを固定できます。",
    "accountTwoFactorSetup": {
      "backToSecurity": "セキュリティに戻る",
      "title": "2段階認証の設定",
      "description": "{{email}} の認証アプリを設定します。",
      "thisAccount": "このアカウント",
      "enabled": "有効",
      "currentPassword": "現在のパスワード",
      "scanQr": "QRコードをスキャン",
      "qrAlt": "2段階認証のQRコード",
      "qrUnavailable": "QRコードを利用できません",
      "expiresAt": "{{time}} に期限切れになります。",
      "openOtpauth": "otpauth URIを開く",
      "verificationCode": "認証コード",
      "enable": "2FAを有効にする",
      "step1": {
        "title": "ステップ1：認証キーを生成",
        "withPassword": "新しい2FA設定を作成する前にパスワードを確認してください。",
        "noPassword": "アカウントの新しい認証キーを生成します。",
        "action": "認証キーを生成"
      },
      "step2": {
        "title": "ステップ2：スキャンして確認",
        "description": "Google Authenticator、1Password、AuthyなどのTOTPアプリでQRコードをスキャンしてください。スキャンできない場合は、セットアップキーを手動で入力してください。"
      }
    }
  },
  ko: {
    "libraries.libraryCard.pin": "라이브러리 고정",
    "libraries.libraryCard.unpin": "고정 해제",
    "libraries.pinLimitReached": "최대 {{max}}개의 라이브러리를 고정할 수 있습니다.",
    "accountTwoFactorSetup": {
      "backToSecurity": "보안으로 돌아가기",
      "title": "2단계 인증 설정",
      "description": "{{email}}에 대한 인증 앱을 구성합니다.",
      "thisAccount": "이 계정",
      "enabled": "활성화됨",
      "currentPassword": "현재 비밀번호",
      "scanQr": "QR 코드 스캔",
      "qrAlt": "2단계 인증 QR 코드",
      "qrUnavailable": "QR 코드를 사용할 수 없음",
      "expiresAt": "{{time}}에 만료됩니다.",
      "openOtpauth": "otpauth URI 열기",
      "verificationCode": "인증 코드",
      "enable": "2FA 활성화",
      "step1": {
        "title": "1단계: 인증기 비밀 키 생성",
        "withPassword": "새 2FA 설정을 만들기 전에 비밀번호를 확인하세요.",
        "noPassword": "계정에 대한 새 인증기 비밀 키를 생성합니다.",
        "action": "인증기 비밀 키 생성"
      },
      "step2": {
        "title": "2단계: 스캔 및 확인",
        "description": "Google Authenticator, 1Password, Authy 또는 다른 TOTP 앱으로 QR 코드를 스캔하세요. 스캔할 수 없는 경우 설정 키를 수동으로 입력하세요."
      }
    }
  },
  "zh-CN": {
    "libraries.libraryCard.pin": "固定库",
    "libraries.libraryCard.unpin": "取消固定",
    "libraries.pinLimitReached": "您最多只能固定 {{max}} 个库。",
    "providerForm.accessKeyLabel": "访问密钥 (Access Key)",
    "providerForm.secretKeyLabel": "秘密密钥 (Secret Key)",
    "projectViewer.queue.contextShort": "上下文"
  },
  "zh-TW": {
    "libraries.libraryCard.pin": "固定庫",
    "libraries.libraryCard.unpin": "取消固定",
    "libraries.pinLimitReached": "您最多只能固定 {{max}} 個庫。",
    "providerForm.apiKeyLabel": "API 金鑰",
    "providerForm.accessKeyLabel": "訪問金鑰 (Access Key)",
    "providerForm.secretKeyLabel": "秘密金鑰 (Secret Key)",
    "providerForm.apiUrlLabel": "API 位址",
    "projectViewer.queue.contextShort": "上下文"
  }
};

function setDeepValue(obj: any, path: string, value: any) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

for (const file of files) {
  const lang = path.basename(file, '.json');
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const langTranslations = translations[lang];

  for (const path in langTranslations) {
    const val = langTranslations[path];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
       // Deep object assignment
       const keys = path.split('.');
       let current = data;
       for (const key of keys) {
         if (!current[key]) current[key] = {};
         current = current[key];
       }
       Object.assign(current, val);
    } else {
       setDeepValue(data, path, val);
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

console.log('Completed internationalization for missing blocks across all languages.');
