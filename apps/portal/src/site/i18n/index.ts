import { en, type SiteCopy } from './en';

/** Locale activo del sitio público. Preparado para añadir más idiomas con el mismo contrato. */
const LOCALES: Record<string, SiteCopy> = { en };

export function useCopy(locale = 'en'): SiteCopy {
  return LOCALES[locale] ?? en;
}
