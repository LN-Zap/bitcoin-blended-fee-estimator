import { raw } from "hono/html";
import { Layout } from "./Layout";
import { BlockchainData } from "../lib/DataProviderManager";

export const Content = (props: {
  siteData: SiteData;
  data: BlockchainData;
}) => (
  <Layout {...props.siteData}>
    <div class="logo">
      <svg
        width="20"
        height="20"
        viewBox="0 0 155 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.06565 43.2477C1.90963 41.2685 -0.665684 35.4843 1.31353 30.3283C3.29274 25.1722 9.07699 22.5969 14.233 24.5761L51.4526 38.8634C51.4937 38.8798 51.535 38.896 51.5765 38.9119L70.2481 46.0792C75.4041 48.0584 81.1883 45.4831 83.1675 40.3271C85.1468 35.1711 82.5714 29.3868 77.4154 27.4076L77.4132 27.4068C77.4139 27.4064 77.4145 27.406 77.4151 27.4056L58.7436 20.2383C53.5876 18.2591 51.0123 12.4749 52.9915 7.31885C54.9707 2.16283 60.755 -0.412485 65.911 1.56673L120.828 22.6473C120.959 22.6977 121.089 22.7506 121.217 22.8059C121.453 22.8928 121.69 22.9815 121.926 23.0721C147.706 32.9681 160.583 61.8894 150.686 87.6695C140.79 113.45 111.869 126.326 86.089 116.43C85.5927 116.24 85.1011 116.042 84.6144 115.838C84.3783 115.766 84.1431 115.686 83.9091 115.596L30.0742 94.9308C24.9182 92.9516 22.3428 87.1673 24.3221 82.0113C26.3013 76.8553 32.0855 74.2799 37.2415 76.2592L55.9106 83.4256C55.9103 83.4242 55.9099 83.4229 55.9095 83.4215L55.9133 83.423C61.0694 85.4022 66.8536 82.8269 68.8328 77.6709C70.812 72.5148 68.2367 66.7306 63.0807 64.7514L54.6786 61.5261C54.6787 61.5257 54.6788 61.5252 54.6789 61.5247L7.06565 43.2477Z"
          fill="currentColor"
        ></path>
      </svg>
    </div>

    <div class="header">
      <h1>{props.siteData.title}</h1>
      <p>{props.siteData.subtitle}</p>
    </div>

    <div class="content">
      <pre>
        <span class="blue">curl</span> -L -X GET{" "}
        <span class="green">'{props.siteData.baseUrl}/v1/fee-estimates'</span>
      </pre>

      <pre>{raw(JSON.stringify(props.data, null, 2))}</pre>
    </div>

    <div class="footer">
      <a href="https://github.com/LN-Zap/bitcoin-blended-fee-estimator">
        https://github.com/LN-Zap/bitcoin-blended-fee-estimator
      </a>
    </div>
  </Layout>
);
