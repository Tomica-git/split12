import { isOpenableUrl } from '../core/url';

const target = new URLSearchParams(location.search).get('to');
if (isOpenableUrl(target)) location.replace(target);
