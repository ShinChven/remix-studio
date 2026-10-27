import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon, Ripple, Shape, Text } from '../../../m3';
import type { ProviderType } from '../../../types';
import { kindMeta } from '../../ui/entityMeta';
import { ProviderMark } from './ProviderMark';
import { SERVICE_TYPES, serviceKinds, serviceMeta, type ProviderKind } from './providerMeta';

function ServiceTile({ type }: { type: ProviderType }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  return (
    <li>
      <Link
        to={`/provider/new?type=${type}`}
        className="v2-service-tile m3-focus-ring"
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
      >
        <Ripple />
        <ProviderMark type={type} size={48} active={active} />
        <span className="v2-service-tile__text">
          <Text as="span" variant="title-small" emphasized className="v2-service-tile__name">
            {serviceMeta(type).label}
          </Text>
          <span className="v2-service-tile__kinds">
            {serviceKinds(type).map((kind) => (
              <span key={kind} data-kind={kind} title={t(`v2.providers.kind.${kind}`)}>
                <Icon name={kindMeta(kind).icon} size={14} filled aria-label={t(`v2.providers.kind.${kind}`)} />
              </span>
            ))}
          </span>
        </span>
        <Icon name="add" size={20} className="v2-service-tile__add" />
      </Link>
    </li>
  );
}

/**
 * The services the studio can connect to, each opening the new-provider form with it chosen:
 * all of them, or with `kind` only those that make it.
 */
export function ServiceGallery({ kind }: { kind?: ProviderKind }) {
  const { t } = useTranslation();
  const types = kind ? SERVICE_TYPES.filter((type) => serviceKinds(type).includes(kind)) : SERVICE_TYPES;
  return (
    <div className="v2-service-gallery" data-kind={kind}>
      <div className="v2-service-gallery__head">
        <span className="v2-service-gallery__art" aria-hidden>
          <Shape name={kind ? kindMeta(kind).shape : 'cookie-9'} size={72} className="v2-service-gallery__shape" />
          <Icon name={kind ? kindMeta(kind).icon : 'key'} size={30} filled />
        </span>
        <Text as="h2" variant="title-large" emphasized>
          {kind ? t(`v2.providers.noKindTitle.${kind}`) : t('v2.providers.emptyTitle')}
        </Text>
        <Text as="p" variant="body-medium" className="v2-service-gallery__description">
          {kind ? t('v2.providers.noKindDescription') : t('v2.providers.emptyDescription')}
        </Text>
      </div>
      <ul className="v2-service-gallery__grid">
        {types.map((type) => (
          <ServiceTile key={type} type={type} />
        ))}
      </ul>
    </div>
  );
}

/** The last tile of the card grid: connect another service. */
export function AddServiceTile() {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  return (
    <li className="v2-provider-add-slot">
      <Link
        to="/provider/new"
        className="v2-provider-add m3-focus-ring"
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
      >
        <Ripple />
        <span className="v2-provider-add__art" aria-hidden>
          <Shape name={active ? 'sunny' : 'cookie-9'} size={56} />
          <Icon name="add" size={26} />
        </span>
        <Text as="span" variant="title-small" emphasized>
          {t('v2.providers.connectService')}
        </Text>
        <Text as="span" variant="body-small" className="v2-provider-add__hint">
          {t('v2.providers.connectServiceHint', { count: SERVICE_TYPES.length })}
        </Text>
      </Link>
    </li>
  );
}
