import { Link } from 'react-router-dom';
import type { LinkComponentProps } from '../../m3';

const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;

/** Link adapter for M3 components: in-app paths route client-side, everything else is an anchor. */
export function RouterLink({ href, ref, ...rest }: LinkComponentProps) {
  if (EXTERNAL.test(href) || rest.target === '_blank' || rest.download !== undefined || href.startsWith('/api/')) {
    return <a {...rest} ref={ref} href={href} />;
  }
  return <Link {...rest} ref={ref} to={href} />;
}
