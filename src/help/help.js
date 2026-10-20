import en from './help_en';
import de from './help_de';
import fa from './help_fa';
import bg from './help_bg';
import cz from './help_cz';
import hi from './help_hi';
import pl from './help_pl';

export const help = {
  en: en,
  de: de,
  fa: fa,
  bg: bg,
  cz: cz,
  hi: hi,
  pl: pl,
};

export function useHelp(language) {
  if(help[language]){
    return help[language]
  }else{
    return help['en']
  }
}
