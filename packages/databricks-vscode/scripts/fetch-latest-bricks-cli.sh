BRICKS_ARCH=$1
mkdir -p bin
cd ./bin
rm -rf bricks
gh repo clone databricks/bricks
cd bricks

gh release download -p "*$BRICKS_ARCH.tar.gz"
tar -xvf `ls | grep -E bricks_*_$BRICKS_ARCH.tar.gz`

mv bricks ../bricks_cli

cd ..
rm -rf bricks/
mv bricks_cli bricks