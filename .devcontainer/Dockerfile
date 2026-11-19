FROM mcr.microsoft.com/devcontainers/javascript-node:4-24-trixie

# [Optional] Uncomment this section to install additional OS packages.
# s-nail は Mailpit (compose.yaml の mail サービス) でメールを送受信するためのメーラー (設定は s-nail.rc)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends libpq-dev python3 g++ make postgresql-client s-nail

# [Optional] Uncomment if you want to install an additional version of node using nvm
# see .nvmrc
ARG EXTRA_NODE_VERSION=v24.12.0
RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install ${EXTRA_NODE_VERSION}"

# [Optional] Uncomment if you want to install more global node modules
# RUN su node -c "npm install -g <your-package-list-here>"

# bash aliases
RUN echo "alias npm='pnpm'" >> ~/.bash_aliases \
    && echo "alias npx='pnpx'" >> ~/.bash_aliases 
