BRICKS_ARCH=$1
pushd /tmp
rm -rf bricks_*
gh release download -R databricks/bricks -p "*$BRICKS_ARCH.tar.gz"
tar -xvf bricks_*_$BRICKS_ARCH.tar.gz

popd
mkdir -p bin
cd ./bin
rm -rf bricks
mv /tmp/bricks ./
