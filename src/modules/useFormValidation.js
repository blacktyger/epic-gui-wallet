import { reactive } from "vue";
import { i18n } from '../i18n';
import useValidators from '@/modules/Validators';
import { epicToNano, amountProblem } from '@/shared/sendMath';
import { isUnknownRecipient } from '@/shared/sendForm';

const errors = reactive({});


const { isEmpty, minLength, isSpendable, isDirEmpty, isHttpAddress, isEpicboxAddress } = useValidators();

export default function useFormValidation() {

    const validatePasswordField = (fieldName, fieldValue, repeat) => {
        let message = null;

        if(repeat){
          message = !fieldValue ? isEmpty(fieldName, fieldValue) : minLength(fieldName, fieldValue, 4) || (fieldValue !== repeat ? i18n.global.t("msg.validators.password_mismatch") : null);
        }else{
          message = !fieldValue ? isEmpty(fieldName, fieldValue) : minLength(fieldName, fieldValue, 4);
        }

        if(message !== null){
          errors[fieldName] = message;
          return false;
        }
        return true;
    }

    /* fieldValue: the typed amount (EPIC, a String); spendable: the balance in EPIC;
       fee: what amountField got from the wallet's estimate for exactly this amount,
       { fee, short } in nanoepic, or null when it is not known */
    const validateAmountField = (fieldName, fieldValue, spendable, fee) => {

        let message = null;
        const raw = fieldValue === null || fieldValue === undefined ? '' : String(fieldValue).trim();
        if(!fieldValue || raw === ''){
          message = isEmpty(fieldName, fieldValue);
        }else{
          const problem = amountProblem(raw);
          const amount = epicToNano(raw);
          if(problem == 'decimals'){
            message = i18n.global.t("msg.validators.decimals", [fieldName]);
          }else if(problem == 'large'){
            message = i18n.global.t("msg.validators.spendable");
          }else if(problem){
            message = i18n.global.t("msg.validators.number", [fieldName]);
          }else if(amount === 0){
            message = i18n.global.t("msg.validators.positive", [fieldName]);
          }else if(fee && fee.short){
            //the wallet itself says amount + fee is more than it can spend
            message = i18n.global.t("msg.validators.spendable");
          }else{
            //the balance on screen can be a refresh behind: coins the wallet just confirmed count too
            let spendableNano = epicToNano(Number(spendable) || 0) || 0;
            if(fee && fee.available > spendableNano){
              spendableNano = fee.available;
            }
            message = isSpendable(fieldName, amount, fee ? fee.fee : null, spendableNano);
          }
        }
        if(message !== null){
          errors[fieldName] = message;
          return false;
        }
        return true;
    }
    const validateTextField = (fieldName, fieldValue) => {

        let message = !fieldValue ? isEmpty(fieldName, fieldValue) : null;
        if(message !== null){
          errors[fieldName] = message;
          return false;
        }
        return true;
    }
    const validateProofAddressField = (fieldName, fieldValue) => {

        let message = minLength(fieldName, fieldValue, 64);
        if(message !== null){
          errors[fieldName] = message;
          return false;
        }
        return true;
    }

    const validateAddressField = (fieldName, fieldValue, forceHttp) => {

        let message = null;
        if(fieldValue.includes('http') || fieldValue.includes('https') || forceHttp){
          message = !fieldValue ? isEmpty(fieldName, fieldValue) : isHttpAddress(fieldName, fieldValue);
        }else if(fieldValue.includes('@') || fieldValue.startsWith('es') || fieldValue.startsWith('epicbox')) { 
          message = !fieldValue ? isEmpty(fieldName, fieldValue) : isEpicboxAddress(fieldName, fieldValue);
        }else{
          message = isEmpty(fieldName, fieldValue) || (isUnknownRecipient(fieldValue) ? i18n.global.t("msg.validators.address") : null);
        }


        if(message !== null){
          errors[fieldName] = message;
          return false;
        }
        return true;
    }

    const validateDirField = (fieldName, fieldValue, configService) => {

        let message = isDirEmpty(fieldName, fieldValue);
        if(message !== null){
          errors[fieldName] = message;
          return false;
        }
        return true;
    }

    const resetFormErrors = () => {
      for (const [key, value] of Object.entries(errors)) {
          errors[key] = null;
      }
    }

    return {
      errors,
      resetFormErrors,
      validatePasswordField,
      validateAmountField,
      validateProofAddressField,
      validateAddressField,
      validateDirField,
      validateTextField
    }
}
