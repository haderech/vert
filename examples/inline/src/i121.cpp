#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] i121 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void send(int64_t value)
   {
      print(" 6 ");

      send_action i1211("i1211"_n, {get_self(), "active"_n});
      i1211.send(value);

      require_recipient("n1212"_n);
   }

   using send_action = action_wrapper<"send"_n, &i121::send>;

   [[eosio::action]]
   void abc(int64_t value){}
};