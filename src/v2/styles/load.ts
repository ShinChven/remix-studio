// The new UI's stylesheets, loaded by the entry beside the app itself. Kept out of the app's
// own module graph so the bundler cannot fold them into a shared chunk whose import it no
// longer wraps in a stylesheet preload, which left /v2 unstyled in production builds.
import '../../m3/styles/fonts.css';
import './index.css';
