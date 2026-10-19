/*
 * Options for every toast (@meforma/vue-toaster, main.js): unit-tested in tests/toastOptions.test.js.
 *
 * The toaster pauses a toast's timer on mouseover and resumes it only on mouseleave. A toast that
 * appears under a pointer that doesn't move (it pops up where the user just clicked, such as
 * "External Node is online" after Unlock or Save) never got a mouseleave and stayed for good.
 * No pause on hover: every toast hides after its duration; a click still closes it at once.
 */
export const toastOptions = {
  duration: 4000,
  pauseOnHover: false,
  dismissible: true,
};
