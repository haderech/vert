#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] n1221 : public contract {
public:
   using contract::contract;

   [[eosio::on_notify("*::send")]]
   void send(int64_t value)
   {
      print(" 10 ");
   }

   [[eosio::action]]
   void abc(int64_t value){}
};
