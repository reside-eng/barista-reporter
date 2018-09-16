import axios from 'axios';
import { get } from 'lodash';
import {
  BARISTA_API_BASE_URL,
  BARISTA_API_STAGE_BASE_URL,
  BARISTA_API_LOCAL_BASE_URL,
} from './constants';

/**
 * Get base URL for Barista REST API
 * @param {Object} reporterOptions Options for reporter
 * @param {Boolean} reporterOptions.useStage Whether or not to use stage url
 * @param {Boolean} reporterOptions.useLocal Whether or not to use local url
 */
function getBaristaApiBaseUrl(reporterOptions) {
  if (reporterOptions.useStage) {
    return BARISTA_API_STAGE_BASE_URL;
  }
  if (reporterOptions.useLocal) {
    return BARISTA_API_LOCAL_BASE_URL;
  }
  return BARISTA_API_BASE_URL;
}

/**
 * Create object representing barista API instance
 * @param {Object} reporterOptions - Options provided to barista-reporter
 * @example
 * baristaApiInstance.post({ meta: { data: 'asdf' } })
 */
export function createBaristaApiInstance(reporterOptions = {}) {
  // Create axios instance with Barista API as baseURL
  const apiInstance = axios.create({
    baseURL: getBaristaApiBaseUrl(reporterOptions),
  });
  const baristaProjectId =
    reporterOptions.baristaProject || process.env.BARISTA_PROJECT || 'barista';
  const jobRunKey =
    reporterOptions.jobRunKey ||
    process.env.JOB_RUN_KEY ||
    `${baristaProjectId}/${Date.now()}`;

  // Add request interceptors
  apiInstance.interceptors.request.use(config => {
    if (config.method === 'post') {
      // Attach jobRunKey and baristaProjectId to post requests
      return {
        ...config,
        data: { ...config.data, jobRunKey, baristaProjectId },
      };
    }
    return config;
  });
  // Add response interceptors
  apiInstance.interceptors.response.use(response => {
    if (response.status === 400) {
      const errData = get(response, 'data', response);
      console.log('Error sending to barista api:\n', JSON.stringify(errData)); // eslint-disable-line no-console
    }
    return response;
  });
  return {
    ...apiInstance,
    reporterOptions,
    jobRunKey,
    baristaProjectId,
  };
}

/**
 * Send test report data to Barista API with jobRunKey attached
 * @param {Object} data - Test data to send to barista API
 */
export function sendDataToBaristaApi(baristaApiInstance, data = {}) {
  return baristaApiInstance.post('/runs/sendReport', data);
}
