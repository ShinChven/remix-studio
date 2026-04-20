import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');

const translations: Record<string, any> = {
  fr: {
    "libraryImportExport": {
      "badge": "Espace de travail de la bibliothèque de texte",
      "title": "Importation et Sortie",
      "description": "Chargez en masse des fragments d'invites, préservez les tags à la sortie et maintenez un format d'importation propre pour l'édition en dehors de l'application.",
      "toasts": {
        "importFailed": "Échec de l'importation des éléments.",
        "outputCopied": "Sortie de la bibliothèque copiée dans le presse-papiers",
        "copyFailed": "Échec de la copie de la sortie."
      },
      "stats": {
        "library": "Bibliothèque",
        "currentItems": "Éléments actuels",
        "currentTags": "Tags actuels",
        "readyToImport": "Prêt à importer"
      }
    },
    "mcpConnections": {
      "title": "Connexions MCP",
      "description": "Gérez les serveurs du Model Context Protocol pour étendre les capacités de votre assistant.",
      "status": {
        "connected": "Connecté",
        "disconnected": "Déconnecté",
        "error": "Erreur"
      }
    }
  },
  ja: {
    "libraryImportExport": {
      "badge": "テキストライブラリワークスペース",
      "title": "インポートと出力",
      "description": "プロンプトフラグメントを一括読み込みし、出力時にタグを保持します。アプリ外での編集用にクリーンなインポート形式を維持します。",
      "toasts": {
        "importFailed": "項目のインポートに失敗しました。",
        "outputCopied": "ライブラリの出力がクリップボードにコピーされました",
        "copyFailed": "出力のコピーに失敗しました。"
      },
      "stats": {
        "library": "ライブラリ",
        "currentItems": "現在の項目数",
        "currentTags": "現在のタグ数",
        "readyToImport": "インポート準備完了"
      }
    },
    "mcpConnections": {
      "title": "MCP接続",
      "description": "Model Context Protocolサーバーを管理して、アシスタントの機能を拡張します。",
      "status": {
        "connected": "接続済み",
        "disconnected": "切断済み",
        "error": "エラー"
      }
    }
  },
  ko: {
    "libraryImportExport": {
      "badge": "텍스트 라이브러리 작업 공간",
      "title": "가져오기 및 출력",
      "description": "프롬프트 조각을 대량으로 로드하고, 출력 시 태그를 유지하며, 앱 외부에서 편집할 수 있도록 깔끔한 가져오기 형식을 유지합니다.",
      "toasts": {
        "importFailed": "항목을 가져오지 못했습니다.",
        "outputCopied": "라이브러리 출력이 클립보드에 복사되었습니다.",
        "copyFailed": "출력을 복사하지 못했습니다."
      },
      "stats": {
        "library": "라이브러리",
        "currentItems": "현재 항목 수",
        "currentTags": "현재 태그 수",
        "readyToImport": "가져오기 준비 완료"
      }
    },
    "mcpConnections": {
      "title": "MCP 연결",
      "description": "Model Context Protocol 서버를 관리하여 어시스턴트의 기능을 확장합니다.",
      "status": {
        "connected": "연결됨",
        "disconnected": "연결 끊김",
        "error": "오류"
      }
    }
  },
  "zh-CN": {
    "mcpConnections": {
      "title": "MCP 连接",
      "description": "管理 Model Context Protocol 服务器以扩展您的助手能力。",
      "status": {
        "connected": "已连接",
        "disconnected": "已断开",
        "error": "错误"
      }
    }
  },
  "zh-TW": {
    "mcpConnections": {
      "title": "MCP 連接",
      "description": "管理 Model Context Protocol 服務器以擴展您的助手能力。",
      "status": {
        "connected": "已連接",
        "disconnected": "已斷開",
        "error": "錯誤"
      }
    }
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

  if (langTranslations) {
    for (const topKey in langTranslations) {
      if (!data[topKey]) data[topKey] = {};
      Object.assign(data[topKey], langTranslations[topKey]);
    }
  }

  // Also fix specific known issues
  if (lang === 'fr') {
    data.sidebar.assistant = "Assistant";
    data.sidebar.exports = "Exportations";
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

console.log('Finalized internationalization for remaining major blocks.');
